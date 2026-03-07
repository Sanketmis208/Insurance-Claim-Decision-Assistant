"""
decision_engine.py — Rule-based insurance claim decision engine.

Architecture:
    ExtractedClaimParameters
        → PolicyRuleSet (configurable rules)
        → List[RuleEvaluation]
        → ClaimDecisionResponse

Design principles:
    - Each rule is an independent, testable function.
    - Rules are registered in a central RULE_REGISTRY list — easy to add/remove.
    - Rules receive the full ExtractedClaimParameters object, keeping signatures
      stable even as the schema grows.
    - The engine is stateless; all configuration lives in PolicyConfig.
    - Ready for extension: rules can later be loaded from a vector DB or
      policy document store (RAG layer).
"""

import logging
from dataclasses import dataclass, field
from typing import List, Callable, Tuple

from app.models import (
    ExtractedClaimParameters,
    ClaimDecisionResponse,
    RuleEvaluation,
    DecisionStatus,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Policy Configuration
# ─────────────────────────────────────────────

@dataclass
class PolicyConfig:
    """
    Central configuration for all policy rules.
    Swap values here (or load from DB/env) without touching rule logic.
    """
    # Minimum policy active duration before claims are accepted
    min_policy_duration_years: float = 2.0

    # Maximum coverage payout ceiling (hard cap regardless of policy)
    max_coverage_cap_inr: float = 10_000_000  # 1 crore

    # Procedures with a waiting period (procedure keyword → wait in years)
    waiting_period_procedures: dict = field(default_factory=lambda: {
        "knee replacement":       2.0,
        "hip replacement":        2.0,
        "cataract":               1.0,
        "hernia":                 1.0,
        "joint replacement":      2.0,
        "bariatric":              3.0,
        "weight loss surgery":    3.0,
        "cosmetic":               float("inf"),   # Never covered
        "dental":                 1.0,
        "maternity":              0.75,            # 9 months
    })

    # Age restrictions: procedure keyword → (min_age, max_age)
    age_restrictions: dict = field(default_factory=lambda: {
        "bariatric":           (18, 65),
        "weight loss surgery": (18, 65),
        "knee replacement":    (18, 80),
        "hip replacement":     (18, 80),
        "cosmetic":            (18, float("inf")),
    })

    # Deductible percentage applied to approved claims
    deductible_percentage: float = 0.10   # 10% co-pay

    # Minimum claimant age
    min_claimant_age: int = 18

    # Maximum claimant age for new claims
    max_claimant_age: int = 80


# Singleton policy config — can be overridden or loaded from env/DB
DEFAULT_POLICY = PolicyConfig()


# ─────────────────────────────────────────────
# Rule Type Alias
# ─────────────────────────────────────────────

# Each rule is a callable: (params, config) → (passed: bool, detail: str)
RuleFn = Callable[[ExtractedClaimParameters, PolicyConfig], Tuple[bool, str]]


# ─────────────────────────────────────────────
# Individual Rule Implementations
# ─────────────────────────────────────────────

def rule_policy_duration(params: ExtractedClaimParameters, cfg: PolicyConfig) -> Tuple[bool, str]:
    """Policy must have been active for at least the minimum required duration."""
    duration = params.policy_duration_years
    minimum = cfg.min_policy_duration_years
    passed = duration >= minimum
    detail = (
        f"Policy has been active for {duration:.1f} year(s). "
        f"Minimum required: {minimum:.1f} year(s). "
        + ("✓ Condition met." if passed else "✗ Policy too new — claim not eligible.")
    )
    return passed, detail


def rule_waiting_period(params: ExtractedClaimParameters, cfg: PolicyConfig) -> Tuple[bool, str]:
    """Certain procedures have mandatory waiting periods from policy start date."""
    procedure = params.medical_procedure.lower()
    duration = params.policy_duration_years

    matched_wait = None
    matched_procedure = None
    for keyword, wait_years in cfg.waiting_period_procedures.items():
        if keyword in procedure:
            matched_wait = wait_years
            matched_procedure = keyword
            break

    if matched_wait is None:
        return True, f"No specific waiting period applies to '{params.medical_procedure}'. ✓"

    if matched_wait == float("inf"):
        return False, (
            f"'{matched_procedure.title()}' procedures are explicitly excluded "
            f"from coverage under this policy. ✗"
        )

    passed = duration >= matched_wait
    detail = (
        f"'{matched_procedure.title()}' has a waiting period of {matched_wait:.1f} year(s). "
        f"Policy active for {duration:.1f} year(s). "
        + ("✓ Waiting period satisfied." if passed else "✗ Waiting period not yet met.")
    )
    return passed, detail


def rule_coverage_amount(params: ExtractedClaimParameters, cfg: PolicyConfig) -> Tuple[bool, str]:
    """Claimed amount must not exceed the policy's coverage limit."""
    # If no specific claimed amount, assume full procedure against coverage
    claimed = params.claimed_amount or params.coverage_amount
    coverage = params.coverage_amount
    cap = cfg.max_coverage_cap_inr

    within_coverage = claimed <= coverage
    within_cap = coverage <= cap

    if not within_cap:
        return False, (
            f"Policy coverage of ₹{coverage:,.0f} exceeds the system cap "
            f"of ₹{cap:,.0f}. Manual review required. ✗"
        )

    if not within_coverage:
        return False, (
            f"Claimed amount ₹{claimed:,.0f} exceeds policy coverage limit "
            f"of ₹{coverage:,.0f}. ✗"
        )

    return True, (
        f"Claimed amount ₹{claimed:,.0f} is within policy coverage "
        f"of ₹{coverage:,.0f}. ✓"
    )


def rule_age_restriction(params: ExtractedClaimParameters, cfg: PolicyConfig) -> Tuple[bool, str]:
    """Claimant age must fall within the general and procedure-specific limits."""
    age = params.age
    procedure = params.medical_procedure.lower()

    # General age check
    if age < cfg.min_claimant_age:
        return False, (
            f"Claimant age {age} is below the minimum eligible age "
            f"of {cfg.min_claimant_age}. ✗"
        )
    if age > cfg.max_claimant_age:
        return False, (
            f"Claimant age {age} exceeds the maximum eligible age "
            f"of {cfg.max_claimant_age} for new claims. ✗"
        )

    # Procedure-specific age check
    for keyword, (min_age, max_age) in cfg.age_restrictions.items():
        if keyword in procedure:
            if not (min_age <= age <= max_age):
                return False, (
                    f"'{keyword.title()}' requires claimant age between {min_age} "
                    f"and {max_age}. Claimant is {age}. ✗"
                )
            return True, (
                f"Claimant age {age} is within the required range "
                f"[{min_age}–{max_age}] for '{keyword}'. ✓"
            )

    return True, f"Claimant age {age} meets all age requirements for this procedure. ✓"


def rule_pre_existing_condition(params: ExtractedClaimParameters, cfg: PolicyConfig) -> Tuple[bool, str]:
    """Pre-existing conditions require the policy to be active for at least 3 years."""
    if params.pre_existing_condition is None:
        return True, "No pre-existing condition information provided; skipping check. ✓"

    if params.pre_existing_condition:
        required_years = 3.0
        passed = params.policy_duration_years >= required_years
        detail = (
            f"Claim involves a pre-existing condition. "
            f"Policy active for {params.policy_duration_years:.1f} year(s); "
            f"requires {required_years:.1f} year(s). "
            + ("✓ Satisfied." if passed else "✗ Not satisfied.")
        )
        return passed, detail

    return True, "Procedure is not related to a pre-existing condition. ✓"


# ─────────────────────────────────────────────
# Rule Registry
# ─────────────────────────────────────────────
# Add or remove rules here — the engine picks them all up automatically.

RULE_REGISTRY: List[Tuple[str, RuleFn]] = [
    ("Policy Duration Check",       rule_policy_duration),
    ("Procedure Waiting Period",     rule_waiting_period),
    ("Coverage Amount Validation",   rule_coverage_amount),
    ("Age Restriction Check",        rule_age_restriction),
    ("Pre-existing Condition Check", rule_pre_existing_condition),
]


# ─────────────────────────────────────────────
# Decision Engine
# ─────────────────────────────────────────────

def run_decision_engine(
    params: ExtractedClaimParameters,
    policy: PolicyConfig = DEFAULT_POLICY,
) -> ClaimDecisionResponse:
    """
    Execute all registered rules against the extracted claim parameters
    and produce a final structured decision.

    Args:
        params:  Structured claim parameters from the LLM pipeline.
        policy:  Policy configuration (defaults to DEFAULT_POLICY).

    Returns:
        ClaimDecisionResponse with decision, approved amount, justification,
        and per-rule explainability details.
    """
    logger.info("Starting decision engine for procedure='%s'", params.medical_procedure)

    evaluations: List[RuleEvaluation] = []
    failed_rules: List[str] = []

    for rule_name, rule_fn in RULE_REGISTRY:
        try:
            passed, detail = rule_fn(params, policy)
        except Exception as exc:
            logger.error("Rule '%s' raised an exception: %s", rule_name, exc, exc_info=True)
            passed, detail = False, f"Rule evaluation error: {exc}"

        evaluations.append(RuleEvaluation(rule_name=rule_name, passed=passed, detail=detail))
        if not passed:
            failed_rules.append(rule_name)
            logger.warning("Rule FAILED: %s — %s", rule_name, detail)
        else:
            logger.debug("Rule passed: %s", rule_name)

    # ── Determine Decision ──
    if failed_rules:
        decision = DecisionStatus.REJECTED
        approved_amount = 0.0
        justification = (
            f"Claim REJECTED. The following rule(s) were not satisfied: "
            f"{', '.join(failed_rules)}. "
            f"Please review the rule evaluations for detailed reasons."
        )
    else:
        decision = DecisionStatus.APPROVED
        # Apply deductible (co-pay) to the coverage amount
        base_amount = params.claimed_amount or params.coverage_amount
        approved_amount = round(base_amount * (1 - policy.deductible_percentage), 2)
        justification = (
            f"Claim APPROVED. All {len(RULE_REGISTRY)} policy rules passed. "
            f"A {int(policy.deductible_percentage * 100)}% co-pay deductible has been applied. "
            f"Approved amount: ₹{approved_amount:,.0f} out of ₹{base_amount:,.0f}."
        )

    logger.info("Decision: %s | Approved: ₹%.0f", decision, approved_amount)

    return ClaimDecisionResponse(
        decision=decision,
        approved_amount=approved_amount,
        justification=justification,
        rule_evaluations=evaluations,
        extracted_parameters=params,
    )

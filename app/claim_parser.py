"""
claim_parser.py — Top-level orchestrator that wires the LLM pipeline
and the decision engine together into a single async function.

This is the only module that routes/endpoints should call directly.
It intentionally keeps each step separate so that either layer can be
swapped, mocked in tests, or extended (e.g. add a RAG retrieval step
between LLM extraction and rule evaluation).

Flow:
    raw query (str)
        ─▶ [LLM Pipeline]        extract_claim_parameters()
        ─▶ [Decision Engine]     run_decision_engine()
        ─▶ ClaimDecisionResponse
"""

import logging
import time

from app.llm_pipeline import extract_claim_parameters
from app.decision_engine import run_decision_engine, DEFAULT_POLICY
from app.models import ClaimDecisionResponse

logger = logging.getLogger(__name__)


async def process_claim(query: str) -> ClaimDecisionResponse:
    """
    End-to-end claim evaluation pipeline.

    Args:
        query: Natural language claim query from the user.

    Returns:
        ClaimDecisionResponse containing the decision, approved amount,
        justification, per-rule breakdown, and extracted parameters.

    Raises:
        ValueError: If the LLM fails to extract valid parameters.
        Exception:  Any unhandled error from the LLM or engine layer.
    """
    start_time = time.perf_counter()
    logger.info("=== New Claim Evaluation Started ===")
    logger.info("Query (truncated): %.200s", query)

    # ── Step 1: NLU + Parameter Extraction via LLM ──
    logger.info("[Step 1/2] Running LLM extraction pipeline...")
    params = await extract_claim_parameters(query)

    # ── Step 2: Rule-Based Decision Engine ──
    logger.info("[Step 2/2] Running decision engine...")
    response = run_decision_engine(params, policy=DEFAULT_POLICY)

    elapsed = time.perf_counter() - start_time
    logger.info(
        "=== Claim Evaluation Complete in %.2fs | Decision: %s ===",
        elapsed,
        response.decision,
    )

    return response

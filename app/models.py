"""
models.py — Pydantic schemas for all API request/response validation.

Includes both the original claim evaluation models AND the new RAG models.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from enum import Enum


# ═══════════════════════════════════════════════════════════════
# ORIGINAL CLAIM EVALUATION MODELS (unchanged)
# ═══════════════════════════════════════════════════════════════

class DecisionStatus(str, Enum):
    APPROVED       = "APPROVED"
    REJECTED       = "REJECTED"
    PENDING_REVIEW = "PENDING_REVIEW"


class ClaimRequest(BaseModel):
    query: str = Field(..., min_length=10, max_length=2000)


class RuleEvaluation(BaseModel):
    rule_name: str
    passed: bool
    detail: str


class ExtractedClaimParameters(BaseModel):
    age: int = Field(..., ge=0, le=120)
    medical_procedure: str
    location: Optional[str] = Field(default="Not specified")
    policy_duration_years: float = Field(..., ge=0)
    coverage_amount: float = Field(..., ge=0)
    claimed_amount: Optional[float] = None
    pre_existing_condition: Optional[bool] = None
    additional_notes: Optional[str] = None

    @field_validator("medical_procedure")
    @classmethod
    def normalize_procedure(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("location")
    @classmethod
    def normalize_location(cls, v: Optional[str]) -> str:
        if v is None:
            return "Not specified"
        return v.strip().title()


class ClaimDecisionResponse(BaseModel):
    decision: DecisionStatus
    approved_amount: float = Field(..., ge=0)
    justification: str
    rule_evaluations: List[RuleEvaluation] = Field(default_factory=list)
    extracted_parameters: Optional[ExtractedClaimParameters] = None


# Resolve forward refs
ClaimDecisionResponse.model_rebuild()


# ═══════════════════════════════════════════════════════════════
# NEW RAG / POLICY QA MODELS
# ═══════════════════════════════════════════════════════════════

class PolicyUploadResponse(BaseModel):
    """Response returned after successfully ingesting a policy PDF."""
    message: str = Field(..., description="Human-readable success message.")
    filename: str = Field(..., description="Name of the uploaded file.")
    pages_loaded: int = Field(..., description="Number of PDF pages extracted.")
    chunks_stored: int = Field(..., description="Number of text chunks stored in ChromaDB.")
    chunk_size: int = Field(..., description="Configured chunk size in characters.")
    chunk_overlap: int = Field(..., description="Configured chunk overlap in characters.")


class PolicyQuestionRequest(BaseModel):
    """Request body for POST /ask-policy."""
    question: str = Field(
        ...,
        min_length=5,
        max_length=1000,
        description="Natural language question about the insurance policy.",
        examples=["Is knee replacement surgery covered in my policy?"],
    )


class PolicyQuestionResponse(BaseModel):
    """Response returned after answering a policy question via RAG."""
    answer: str = Field(
        ...,
        description="LLM-generated answer grounded in retrieved policy context.",
    )
    source_context: str = Field(
        ...,
        description="Raw policy excerpts used to generate the answer (explainability).",
    )
    chunks_used: int = Field(
        ...,
        description="Number of policy chunks retrieved for context.",
    )


class VectorStoreStatusResponse(BaseModel):
    """Response for GET /policy-status — shows current vector DB state."""
    has_documents: bool
    document_count: int
    message: str
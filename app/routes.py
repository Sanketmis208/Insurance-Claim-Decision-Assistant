"""
routes.py — FastAPI router with all endpoints:

Original endpoints:
    POST /evaluate-claim     — NLU + rule-based claim decision
    GET  /health             — Health check

New RAG endpoints:
    POST /upload-policy      — Upload PDF → ingest into ChromaDB
    POST /ask-policy         — Ask a question → RAG answer
    GET  /policy-status      — Check if a policy is loaded in the vector DB
"""

import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse

from app.models import (
    ClaimRequest,
    ClaimDecisionResponse,
    PolicyUploadResponse,
    PolicyQuestionRequest,
    PolicyQuestionResponse,
    VectorStoreStatusResponse,
)
from app.claim_parser import process_claim
from app.pdf_ingestion import ingest_pdf
from app.rag_pipeline import answer_policy_question
from app.vector_store import collection_exists_and_has_docs, get_document_count

logger = logging.getLogger(__name__)
router = APIRouter()


# ═══════════════════════════════════════════════════════════════
# ORIGINAL ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.post(
    "/evaluate-claim",
    response_model=ClaimDecisionResponse,
    summary="Evaluate an insurance claim",
    tags=["Claims"],
)
async def evaluate_claim(request: ClaimRequest) -> ClaimDecisionResponse:
    """NLU extraction → rule-based decision → structured JSON response."""
    logger.info("POST /evaluate-claim — %d chars", len(request.query))
    try:
        return await process_claim(request.query)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Claim evaluation error: %s", exc)
        raise HTTPException(status_code=500, detail="An unexpected error occurred while evaluating the claim.")


@router.get("/health", summary="Health check", tags=["System"])
async def health_check():
    return {"status": "ok", "service": "insurance-claim-assistant"}


# ═══════════════════════════════════════════════════════════════
# NEW RAG ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.post(
    "/upload-policy",
    response_model=PolicyUploadResponse,
    summary="Upload an insurance policy PDF",
    description=(
        "Upload a PDF insurance policy document. The system will parse the text, "
        "split it into chunks, generate embeddings, and store them in ChromaDB. "
        "Re-uploading will replace the previous policy."
    ),
    tags=["RAG — Policy QA"],
)
async def upload_policy(file: UploadFile = File(...)) -> PolicyUploadResponse:
    """
    Ingest a PDF policy document into the ChromaDB vector store.

    - Accepts multipart/form-data with a 'file' field
    - Only PDF files are accepted
    - Re-uploading replaces the previous policy (collection is reset first)
    """
    logger.info("POST /upload-policy — filename='%s'", file.filename)

    # ── Validate file type ──
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf file.",
        )

    # ── Read file bytes ──
    try:
        content = await file.read()
    except Exception as exc:
        logger.error("Failed to read uploaded file: %s", exc)
        raise HTTPException(status_code=400, detail="Failed to read the uploaded file.")

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    # ── Run ingestion pipeline ──
    try:
        stats = ingest_pdf(filename=file.filename, content=content)
        return PolicyUploadResponse(
            message=f"Policy '{file.filename}' successfully ingested. Ready for questions.",
            **stats,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("PDF ingestion failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process the PDF: {str(exc)}",
        )


@router.post(
    "/ask-policy",
    response_model=PolicyQuestionResponse,
    summary="Ask a question about the uploaded policy",
    description=(
        "Submit a natural language question about the previously uploaded policy PDF. "
        "The system retrieves relevant sections via semantic search and uses an LLM "
        "to generate a grounded answer with source excerpts."
    ),
    tags=["RAG — Policy QA"],
)
async def ask_policy(request: PolicyQuestionRequest) -> PolicyQuestionResponse:
    """
    RAG pipeline: embed question → similarity search → LLM answer.

    Requires a policy PDF to have been uploaded via /upload-policy first.

    Example request:
    ```json
    { "question": "Is knee replacement surgery covered in my policy?" }
    ```
    """
    logger.info("POST /ask-policy — question: %.80s", request.question)

    try:
        result = await answer_policy_question(request.question)
        return PolicyQuestionResponse(**result)

    except ValueError as exc:
        # Raised when no policy has been uploaded yet
        raise HTTPException(status_code=404, detail=str(exc))

    except Exception as exc:
        logger.exception("RAG pipeline error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while answering the question. Please try again.",
        )


@router.get(
    "/policy-status",
    response_model=VectorStoreStatusResponse,
    summary="Check if a policy document is loaded",
    tags=["RAG — Policy QA"],
)
async def policy_status() -> VectorStoreStatusResponse:
    """
    Returns the current state of the ChromaDB vector store.
    Use this to check if a policy has been uploaded before calling /ask-policy.
    """
    has_docs = collection_exists_and_has_docs()
    count    = get_document_count()

    return VectorStoreStatusResponse(
        has_documents=has_docs,
        document_count=count,
        message=(
            f"Policy loaded: {count} chunk(s) available for retrieval."
            if has_docs
            else "No policy document uploaded yet. Use POST /upload-policy first."
        ),
    )
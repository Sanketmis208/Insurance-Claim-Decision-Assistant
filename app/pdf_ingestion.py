"""
pdf_ingestion.py — PDF ingestion pipeline.

Pipeline steps:
    1. Delete any old PDF files from ./uploads/ (only one policy at a time)
    2. Save new uploaded file to ./uploads/
    3. Load PDF pages using PyPDFLoader
    4. Split pages into overlapping chunks using RecursiveCharacterTextSplitter
    5. Embed chunks using HuggingFace sentence-transformers
    6. Store vectors in ChromaDB (reset collection first to avoid stale data)

Chunking strategy:
    - chunk_size=800    — large enough to contain full policy clauses
    - chunk_overlap=150 — prevents losing context at chunk boundaries
    - separators=["\n\n", "\n", ". ", " "] — respects paragraph → sentence → word hierarchy

Single policy design:
    - Only ONE policy PDF is stored at a time
    - Uploading a new PDF automatically deletes the old one
    - ChromaDB is reset before each new ingestion
    - This prevents cross-policy contamination in answers
"""

import logging
import os
import shutil
from pathlib import Path
from typing import List

from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document

from app.vector_store import get_vector_store, reset_collection

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────

UPLOAD_DIR    = os.getenv("UPLOAD_DIR", "./uploads")
CHUNK_SIZE    = int(os.getenv("CHUNK_SIZE", "800"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))


# ── Helpers ────────────────────────────────────────────────────────────────

def ensure_upload_dir() -> None:
    """Create the uploads directory if it doesn't exist."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def clear_old_uploads() -> None:
    """
    Delete ALL existing PDF files from the uploads directory.

    This enforces the single-policy design — only one PDF is
    stored at a time, preventing stale or conflicting policy data.
    """
    upload_path = Path(UPLOAD_DIR)
    if not upload_path.exists():
        return

    deleted = 0
    for old_file in upload_path.glob("*.pdf"):
        try:
            old_file.unlink()
            logger.info("🗑️  Deleted old policy file: %s", old_file.name)
            deleted += 1
        except Exception as exc:
            logger.warning("Could not delete old file %s: %s", old_file.name, exc)

    if deleted > 0:
        logger.info("Cleared %d old PDF file(s) from uploads/", deleted)
    else:
        logger.info("No old PDF files found to clear.")


def save_uploaded_file(filename: str, content: bytes) -> Path:
    """
    Clear old PDFs, then save the new PDF to disk.

    Args:
        filename: Original filename from the upload.
        content:  Raw bytes of the uploaded file.

    Returns:
        Path object pointing to the saved file.
    """
    ensure_upload_dir()

    # ── Delete all old PDFs first ──
    clear_old_uploads()

    # ── Save new file ──
    safe_name = Path(filename).name  # Strip any directory traversal attempts
    file_path = Path(UPLOAD_DIR) / safe_name
    file_path.write_bytes(content)
    logger.info("✅ Saved new policy PDF: %s (%d bytes)", file_path, len(content))
    return file_path


def load_pdf(file_path: Path) -> List[Document]:
    """
    Load all pages from a PDF into LangChain Document objects.

    Args:
        file_path: Path to the saved PDF file.

    Returns:
        List of Document objects, one per PDF page.

    Raises:
        ValueError: If the PDF has no extractable text.
    """
    logger.info("Loading PDF: %s", file_path)
    loader = PyPDFLoader(str(file_path))
    pages = loader.load()

    if not pages:
        raise ValueError(
            f"No pages could be extracted from '{file_path.name}'. "
            "The file may be corrupted or password-protected."
        )

    # Filter out completely blank pages
    pages = [p for p in pages if p.page_content.strip()]

    if not pages:
        raise ValueError(
            f"All pages in '{file_path.name}' are blank or image-based. "
            "Please upload a text-based PDF."
        )

    logger.info("Loaded %d non-blank page(s) from PDF.", len(pages))
    return pages


def split_documents(documents: List[Document]) -> List[Document]:
    """
    Split PDF pages into overlapping text chunks.

    Args:
        documents: List of full-page Document objects.

    Returns:
        List of smaller Document chunks ready for embedding.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
        length_function=len,
    )
    chunks = splitter.split_documents(documents)
    logger.info(
        "Split %d page(s) into %d chunk(s) (chunk_size=%d, overlap=%d).",
        len(documents), len(chunks), CHUNK_SIZE, CHUNK_OVERLAP,
    )
    return chunks


def get_current_policy_filename() -> str | None:
    """
    Return the filename of the currently stored policy PDF, or None if empty.
    Used by the /policy-status endpoint to show which policy is loaded.
    """
    upload_path = Path(UPLOAD_DIR)
    if not upload_path.exists():
        return None
    pdfs = list(upload_path.glob("*.pdf"))
    return pdfs[0].name if pdfs else None


def ingest_pdf(filename: str, content: bytes) -> dict:
    """
    Full ingestion pipeline: clear old → save → load → split → embed → store.

    Args:
        filename: Original PDF filename.
        content:  Raw PDF bytes from the upload.

    Returns:
        Dict with ingestion stats: filename, pages, chunks, chunk_size, chunk_overlap.

    Raises:
        ValueError: If file is not a PDF or has no extractable text.
        Exception:  Any ChromaDB or embedding error.
    """
    # ── Validate file type ──
    if not filename.lower().endswith(".pdf"):
        raise ValueError(
            f"Only PDF files are supported. Received: '{filename}'"
        )

    # ── Validate file size (max 50MB) ──
    max_size = 50 * 1024 * 1024  # 50MB
    if len(content) > max_size:
        raise ValueError(
            f"File too large ({len(content) / 1024 / 1024:.1f}MB). Maximum allowed size is 50MB."
        )

    logger.info("=" * 50)
    logger.info("Starting ingestion for: %s", filename)
    logger.info("File size: %d KB", len(content) // 1024)

    # ── Step 1: Clear old files + Save new file ──
    file_path = save_uploaded_file(filename, content)

    # ── Step 2: Load PDF pages ──
    pages = load_pdf(file_path)

    # ── Step 3: Chunk text ──
    chunks = split_documents(pages)

    if not chunks:
        raise ValueError(
            "Document splitting produced no chunks. "
            "The PDF may be image-based or contain no extractable text."
        )

    # ── Step 4: Reset ChromaDB ──
    logger.info("Resetting ChromaDB collection before ingestion...")
    reset_collection()

    # ── Step 5: Embed + Store ──
    logger.info("Generating embeddings and storing %d chunks in ChromaDB...", len(chunks))
    vector_store = get_vector_store()
    vector_store.add_documents(chunks)

    logger.info("✅ Ingestion complete. %d chunks stored in ChromaDB.", len(chunks))
    logger.info("=" * 50)

    return {
        "filename": filename,
        "pages_loaded": len(pages),
        "chunks_stored": len(chunks),
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
    }
"""
pdf_ingestion.py — PDF ingestion pipeline.

Pipeline steps:
    1. Save uploaded file to ./uploads/
    2. Load PDF pages using PyPDFLoader
    3. Split pages into overlapping chunks using RecursiveCharacterTextSplitter
    4. Embed chunks using HuggingFace sentence-transformers
    5. Store vectors in ChromaDB (reset collection first to avoid stale data)

Chunking strategy:
    - chunk_size=800   — large enough to contain full policy clauses
    - chunk_overlap=150 — prevents losing context at chunk boundaries
    - separators=["\n\n", "\n", ". ", " "] — respects paragraph → sentence → word hierarchy
"""

import logging
import os
from pathlib import Path
from typing import List

from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document

from app.vector_store import get_vector_store, reset_collection

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────

UPLOAD_DIR   = os.getenv("UPLOAD_DIR", "./uploads")
CHUNK_SIZE   = int(os.getenv("CHUNK_SIZE", "800"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))


# ── Helpers ────────────────────────────────────────────────────────────────

def ensure_upload_dir() -> None:
    """Create the uploads directory if it doesn't exist."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def save_uploaded_file(filename: str, content: bytes) -> Path:
    """
    Persist the raw PDF bytes to disk and return the file path.

    Args:
        filename: Original filename from the upload.
        content:  Raw bytes of the uploaded file.

    Returns:
        Path object pointing to the saved file.
    """
    ensure_upload_dir()
    safe_name = Path(filename).name  # Strip any directory traversal
    file_path = Path(UPLOAD_DIR) / safe_name
    file_path.write_bytes(content)
    logger.info("Saved uploaded PDF to: %s (%d bytes)", file_path, len(content))
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
        raise ValueError(f"No pages could be extracted from: {file_path.name}")

    # Filter out blank pages
    pages = [p for p in pages if p.page_content.strip()]
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
        "Split %d page(s) into %d chunk(s) (size=%d, overlap=%d).",
        len(documents), len(chunks), CHUNK_SIZE, CHUNK_OVERLAP,
    )
    return chunks


def ingest_pdf(filename: str, content: bytes) -> dict:
    """
    Full ingestion pipeline: save → load → split → embed → store.

    Args:
        filename: Original PDF filename.
        content:  Raw PDF bytes from the upload.

    Returns:
        Dict with ingestion stats: pages, chunks, collection_name.

    Raises:
        ValueError: If file is not a PDF or has no extractable text.
        Exception:  Any ChromaDB or embedding error.
    """
    # ── Validate file type ──
    if not filename.lower().endswith(".pdf"):
        raise ValueError(f"Only PDF files are supported. Received: '{filename}'")

    # ── Step 1: Save file ──
    file_path = save_uploaded_file(filename, content)

    # ── Step 2: Load PDF ──
    pages = load_pdf(file_path)

    # ── Step 3: Chunk text ──
    chunks = split_documents(pages)

    if not chunks:
        raise ValueError("Document splitting produced no chunks. The PDF may be image-based or empty.")

    # ── Step 4 + 5: Embed and store in ChromaDB ──
    # Reset first so re-uploading a new policy doesn't mix with the old one
    logger.info("Resetting ChromaDB collection before ingestion...")
    reset_collection()

    logger.info("Generating embeddings and storing %d chunks in ChromaDB...", len(chunks))
    vector_store = get_vector_store()
    vector_store.add_documents(chunks)

    logger.info("Ingestion complete. %d chunks stored.", len(chunks))

    return {
        "filename": filename,
        "pages_loaded": len(pages),
        "chunks_stored": len(chunks),
        "chunk_size": CHUNK_SIZE,
        "chunk_overlap": CHUNK_OVERLAP,
    }
import logging
import os
import shutil

import chromadb
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "insurance_policy_docs"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

_embeddings = None
_chroma_client = None  # Global in-memory client singleton
_vector_store = None   # Global vector store singleton


def embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        logger.info("Loading embedding model: %s", EMBEDDING_MODEL)
        _embeddings = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _embeddings


def get_chroma_client() -> chromadb.EphemeralClient:
    """
    Use EphemeralClient (pure in-memory) instead of PersistentClient.
    Avoids ALL macOS SQLite readonly issues completely.
    Data lives in RAM — reset on server restart, which is fine
    since we re-ingest on every upload anyway.
    """
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.EphemeralClient()
        logger.info("✅ ChromaDB EphemeralClient initialized (in-memory).")
    return _chroma_client


def get_vector_store() -> Chroma:
    global _vector_store
    _vector_store = Chroma(
        client=get_chroma_client(),
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings(),
    )
    return _vector_store


def collection_exists_and_has_docs() -> bool:
    try:
        client = get_chroma_client()
        collection = client.get_or_create_collection(COLLECTION_NAME)
        count = collection.count()
        logger.info("ChromaDB has %d document(s).", count)
        return count > 0
    except Exception as exc:
        logger.warning("Could not check ChromaDB: %s", exc)
        return False


def reset_collection() -> None:
    """
    Reset by deleting the in-memory collection.
    New collection will be created fresh on next get_vector_store() call.
    """
    global _chroma_client, _vector_store
    try:
        if _chroma_client is not None:
            _chroma_client.delete_collection(COLLECTION_NAME)
            logger.info("✅ In-memory ChromaDB collection cleared.")
    except Exception as exc:
        logger.warning("Collection may not exist yet: %s", exc)

    _vector_store = None
    logger.info("✅ ChromaDB reset complete.")


def get_document_count() -> int:
    try:
        client = get_chroma_client()
        collection = client.get_or_create_collection(COLLECTION_NAME)
        return collection.count()
    except Exception:
        return 0
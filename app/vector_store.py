import logging
import os
from typing import List

import chromadb
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

logger = logging.getLogger(__name__)

CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
COLLECTION_NAME    = "insurance_policy_docs"
EMBEDDING_MODEL    = "all-MiniLM-L6-v2"

_embeddings = None

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


def get_chroma_client() -> chromadb.PersistentClient:
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    # ← No Settings import — this fixes the conflict error
    return chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)


def get_vector_store() -> Chroma:
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings(),
        persist_directory=CHROMA_PERSIST_DIR,
    )


def collection_exists_and_has_docs() -> bool:
    try:
        client = get_chroma_client()
        collection = client.get_or_create_collection(COLLECTION_NAME)
        count = collection.count()
        return count > 0
    except Exception as exc:
        logger.warning("Could not check ChromaDB collection: %s", exc)
        return False


def reset_collection() -> None:
    try:
        client = get_chroma_client()
        client.delete_collection(COLLECTION_NAME)
        logger.info("ChromaDB collection reset.")
    except Exception as exc:
        logger.warning("Could not reset collection: %s", exc)


def get_document_count() -> int:
    try:
        client = get_chroma_client()
        collection = client.get_or_create_collection(COLLECTION_NAME)
        return collection.count()
    except Exception:
        return 0
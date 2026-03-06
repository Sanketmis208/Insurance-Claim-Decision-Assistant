"""
main.py — FastAPI application factory.

Changes from original:
    - Lifespan hook now pre-warms the embedding model on startup
      so the first /upload-policy request isn't slow
    - Added /uploads and /chroma_db directory creation on startup
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import router
from app.utils import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger = logging.getLogger(__name__)
    logger.info("🚀 %s v%s starting up...", settings.app_title, settings.app_version)

    # Ensure required directories exist
    os.makedirs("./uploads", exist_ok=True)
    os.makedirs("./chroma_db", exist_ok=True)
    logger.info("📁 Directories ready: ./uploads, ./chroma_db")

    # Pre-warm embedding model (downloads on first run, cached after)
    try:
        from app.vector_store import embeddings
        embeddings()
        logger.info("✅ Embedding model pre-warmed and ready.")
    except Exception as exc:
        logger.warning("⚠️  Could not pre-warm embedding model: %s", exc)

    yield

    logger.info("🛑 Shutting down %s.", settings.app_title)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_title,
        version=settings.app_version,
        description=(
            "AI-powered insurance claim evaluation with rule-based decisions "
            "AND RAG-based policy document question answering."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger = logging.getLogger(__name__)
        logger.exception("Unhandled exception on %s: %s", request.url, exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred."},
        )

    app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
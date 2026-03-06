"""
utils.py — Shared utilities: logging configuration, error helpers, and
any cross-cutting concerns that don't belong in a domain module.
"""

import logging
import sys
from app.config import settings


def configure_logging() -> None:
    """
    Configure root logger with a structured format.
    Called once at application startup from main.py.
    """
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Avoid duplicate handlers on hot-reload
    if not root_logger.handlers:
        root_logger.addHandler(handler)

    # Quiet noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("langchain").setLevel(logging.WARNING)


def format_inr(amount: float) -> str:
    """Format a float as an INR string with comma separation."""
    return f"₹{amount:,.0f}"

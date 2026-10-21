"""Structured logging setup using structlog.

Why structlog: JSON logs in production, human-readable logs locally. Same
logger API in both. Log lines carry structured key/value context that ingest
cleanly into Loki, Datadog, CloudWatch, OpenSearch, etc. Plain string logging
does not.
"""

from __future__ import annotations

import logging
import sys
from typing import Any, cast

import structlog


def configure_logging(*, log_level: str = "INFO", json_logs: bool = True) -> None:
    """Configure stdlib logging + structlog.

    Call once at process startup (in `main.py`). Idempotent.
    """
    level = logging.getLevelName(log_level.upper())

    # Reset stdlib root so other libs (uvicorn, sqlalchemy) route through us.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
        force=True,
    )

    # Shared processors run for every log call.
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    # Renderer is the last step: JSON for prod ingestion, ConsoleRenderer for dev.
    renderer: Any = (
        structlog.processors.JSONRenderer()
        if json_logs
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger. Use `get_logger(__name__)` from modules."""
    # structlog's own stubs type `get_logger` as returning `Any` (it's a
    # proxy resolved at configure-time), so the cast just documents the
    # contract we rely on everywhere else in this module.
    return cast("structlog.stdlib.BoundLogger", structlog.get_logger(name))

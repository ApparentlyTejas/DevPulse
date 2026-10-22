"""Thin wrapper around the Anthropic SDK.

A dedicated `get_claude_client` accessor (rather than importing
`anthropic.AsyncAnthropic` directly in `service.py`) gives tests one place
to monkeypatch, and gives us one place to change SDK config later (retries,
timeouts) without touching the triage logic itself.
"""

from __future__ import annotations

from functools import lru_cache

from anthropic import AsyncAnthropic

from app.core.config import Settings


@lru_cache(maxsize=1)
def _cached_client(api_key: str) -> AsyncAnthropic:
    return AsyncAnthropic(api_key=api_key)


def get_claude_client(settings: Settings) -> AsyncAnthropic:
    """Build (or reuse) an `AsyncAnthropic` client from app settings.

    Cached by API key so repeated calls within a process reuse the same
    underlying HTTP connection pool.
    """
    return _cached_client(settings.ai.api_key.get_secret_value())

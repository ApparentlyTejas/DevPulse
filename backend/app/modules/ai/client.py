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
def _cached_client(api_key: str, timeout_seconds: float, max_retries: int) -> AsyncAnthropic:
    return AsyncAnthropic(api_key=api_key, timeout=timeout_seconds, max_retries=max_retries)


def get_claude_client(settings: Settings) -> AsyncAnthropic:
    """Build (or reuse) an `AsyncAnthropic` client from app settings.

    Cached by (api key, timeout, retries) so repeated calls within a process
    reuse the same underlying HTTP connection pool, while still rebuilding
    the client if any of those settings legitimately change (e.g. across
    tests using different `Settings` instances).
    """
    return _cached_client(
        settings.ai.api_key.get_secret_value(),
        settings.ai.request_timeout_seconds,
        settings.ai.max_retries,
    )

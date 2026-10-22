"""Unit tests for the Claude client accessor."""

from __future__ import annotations

from anthropic import AsyncAnthropic
from pydantic import SecretStr

from app.core.config import AISettings, Settings
from app.modules.ai.client import get_claude_client


def test_get_claude_client_returns_async_anthropic() -> None:
    settings = Settings(ai=AISettings(api_key=SecretStr("test-key")))
    client = get_claude_client(settings)
    assert isinstance(client, AsyncAnthropic)


def test_get_claude_client_reuses_cached_instance_for_same_key() -> None:
    settings = Settings(ai=AISettings(api_key=SecretStr("same-key")))
    first = get_claude_client(settings)
    second = get_claude_client(settings)
    assert first is second

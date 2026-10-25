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


def test_get_claude_client_applies_configured_timeout_and_retries() -> None:
    settings = Settings(
        ai=AISettings(
            api_key=SecretStr("timeout-key"),
            request_timeout_seconds=12.5,
            max_retries=5,
        )
    )
    client = get_claude_client(settings)
    assert client.max_retries == 5
    assert client.timeout == 12.5


def test_get_claude_client_rebuilds_when_timeout_differs() -> None:
    base = Settings(ai=AISettings(api_key=SecretStr("rebuild-key"), request_timeout_seconds=10))
    other = Settings(ai=AISettings(api_key=SecretStr("rebuild-key"), request_timeout_seconds=20))
    assert get_claude_client(base) is not get_claude_client(other)

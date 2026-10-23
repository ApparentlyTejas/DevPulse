"""MCP server settings.

Deliberately separate from `app.core.config.Settings`: the MCP server never
touches Postgres or Redis directly, so it has no business requiring their
connection settings just to start up. It only needs to know which DevPulse
API to call, as which org, and with what credential.
"""

from __future__ import annotations

from functools import lru_cache
from uuid import UUID

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class MCPSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DEVPULSE_MCP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_base_url: str = "http://localhost:8000/api/v1"
    access_token: SecretStr
    org_id: UUID
    request_timeout_seconds: float = 10.0


@lru_cache(maxsize=1)
def get_mcp_settings() -> MCPSettings:
    """Cached settings accessor. Tests can clear with `.cache_clear()`."""
    return MCPSettings()

"""Application settings.

Single boundary between the process environment and the rest of the app.
Anywhere in the codebase that needs a config value imports `get_settings()`
from this module. Nothing else reads `os.environ`.

We use pydantic-settings with nested models so config is grouped by concern
(api, security, postgres, redis, ai). Nested env vars use the `__` separator,
e.g. `POSTGRES__HOST` overrides `postgres.host`. We also allow the flat
`POSTGRES_HOST` style by setting `env_nested_delimiter="__"` and using
explicit prefixed sub-models below.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, computed_field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

AppEnv = Literal["local", "dev", "staging", "prod"]


class APISettings(BaseSettings):
    """HTTP server + CORS configuration."""

    model_config = SettingsConfigDict(env_prefix="API_", extra="ignore")

    host: str = "0.0.0.0"  # noqa: S104  bind to all in container; fronted by Nginx in prod
    port: int = 8000
    v1_prefix: str = "/api/v1"
    # `NoDecode` tells pydantic-settings' env loader NOT to JSON-decode this
    # value. Without it, a comma-separated env var like
    #   API_CORS_ORIGINS=http://localhost:5173,http://localhost:3000
    # would fail JSON parsing inside the env source, BEFORE our validator runs.
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        """Accept comma-separated string from env, JSON list, or list from code."""
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("["):
                # Allow a JSON list too, for flexibility.
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


class SecuritySettings(BaseSettings):
    """JWT + auth secrets. Treat every field here as sensitive."""

    model_config = SettingsConfigDict(env_prefix="SECURITY_", extra="ignore")

    jwt_secret: SecretStr = SecretStr("change-me")
    jwt_algorithm: str = "HS256"
    jwt_access_token_ttl_seconds: int = 60 * 15  # 15 minutes
    jwt_refresh_token_ttl_seconds: int = 60 * 60 * 24 * 30  # 30 days


class PostgresSettings(BaseSettings):
    """Postgres connection parts. We assemble the SQLAlchemy URL ourselves."""

    model_config = SettingsConfigDict(env_prefix="POSTGRES_", extra="ignore")

    host: str = "postgres"
    port: int = 5432
    user: str = "devpulse"
    password: SecretStr = SecretStr("devpulse")
    db: str = "devpulse"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def dsn(self) -> str:
        """SQLAlchemy async DSN. Built from parts so we never log the full URL."""
        pwd = self.password.get_secret_value()
        return f"postgresql+asyncpg://{self.user}:{pwd}@{self.host}:{self.port}/{self.db}"


class RedisSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REDIS_", extra="ignore")

    host: str = "redis"
    port: int = 6379
    db: int = 0

    @computed_field  # type: ignore[prop-decorator]
    @property
    def url(self) -> str:
        return f"redis://{self.host}:{self.port}/{self.db}"


class AISettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ANTHROPIC_", extra="ignore")

    api_key: SecretStr = SecretStr("")
    model: str = "claude-sonnet-4-6"
    # Per-org, per-minute cap shared across triage + postmortem generation —
    # both call the Claude API, so both draw from the same budget.
    rate_limit_per_minute: int = 20
    # The SDK's own default read timeout is 600s — fine for a batch job, not
    # for a request/response HTTP endpoint that's holding a DB session open
    # for the duration. 30s comfortably covers both triage (a short tool
    # call) and postmortem generation (a longer markdown document) without
    # letting a stalled Claude request tie up a connection for minutes.
    request_timeout_seconds: float = 30.0
    # The SDK already retries connection errors / 429 / 5xx with backoff by
    # default; kept explicit (rather than left as an implicit SDK default)
    # so a future SDK upgrade can't silently change our retry behavior.
    max_retries: int = 2


class Settings(BaseSettings):
    """Root application settings.

    Loads from process environment and `.env` (local dev convenience).
    Sub-models are constructed independently so each can pick up its own
    prefixed env vars without nested `__` delimiters in env files.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: AppEnv = "local"
    app_name: str = "devpulse"
    app_debug: bool = False
    app_log_level: str = "INFO"

    # Sub-configs. default_factory because Pydantic v2 wants explicit factories
    # for mutable defaults.
    api: APISettings = Field(default_factory=APISettings)
    security: SecuritySettings = Field(default_factory=SecuritySettings)
    postgres: PostgresSettings = Field(default_factory=PostgresSettings)
    redis: RedisSettings = Field(default_factory=RedisSettings)
    ai: AISettings = Field(default_factory=AISettings)

    @property
    def is_production(self) -> bool:
        return self.app_env == "prod"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor.

    Settings are immutable per process; caching avoids re-parsing env on every
    call. Tests can clear the cache with `get_settings.cache_clear()`.
    """
    return Settings()

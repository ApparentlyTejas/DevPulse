"""Unit tests for `app/db/engine.py`'s async engine factory.

`create_async_engine` is lazy — building the engine never opens a real
connection — so these can run as pure unit tests without testcontainers,
asserting the pool/echo configuration that `create_engine` is responsible
for wiring up correctly.
"""

from __future__ import annotations

from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import SecuritySettings, Settings
from app.db.engine import create_engine


def _settings(**overrides: object) -> Settings:
    return Settings(**overrides)  # type: ignore[arg-type]


def test_create_engine_returns_async_engine() -> None:
    engine = create_engine(_settings())
    assert isinstance(engine, AsyncEngine)


def test_create_engine_pool_settings() -> None:
    engine = create_engine(_settings())

    assert engine.sync_engine.pool.size() == 5
    assert engine.sync_engine.pool._max_overflow == 10
    assert engine.sync_engine.pool._pre_ping is True
    assert engine.sync_engine.pool._recycle == 1800


def test_create_engine_echo_disabled_when_not_debug() -> None:
    # app_env="prod" now requires a real (non-placeholder) JWT secret.
    engine = create_engine(
        _settings(
            app_env="prod",
            app_debug=True,
            security=SecuritySettings(jwt_secret=SecretStr("a" * 32)),
        )
    )
    # echo only turns on when BOTH app_env == "local" AND app_debug.
    assert engine.sync_engine.echo is False


def test_create_engine_echo_enabled_in_local_debug() -> None:
    engine = create_engine(_settings(app_env="local", app_debug=True))
    assert engine.sync_engine.echo is True


def test_create_engine_uses_postgres_settings_dsn() -> None:
    settings = _settings()
    settings.postgres.host = "custom-host"
    settings.postgres.port = 6543
    settings.postgres.db = "custom_db"

    engine = create_engine(settings)

    assert engine.url.host == "custom-host"
    assert engine.url.port == 6543
    assert engine.url.database == "custom_db"

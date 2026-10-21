"""Integration tests for the app lifespan (startup/shutdown) and the
`/healthz` + `/readyz` probes.

The regular `client` fixture in `conftest.py` uses `httpx.ASGITransport`,
which never runs ASGI lifespan events — so `app/main.py`'s lifespan
(DB engine + Redis client construction/teardown) and the `/readyz` endpoint
(which reads `app.state.db_engine` / `app.state.redis`, both only set by
lifespan) are never exercised by the existing suite. `fastapi.testclient
.TestClient` *does* run lifespan when used as a context manager, so it's
used here instead, pointed at the same testcontainer Postgres/Redis as the
rest of the integration suite via an explicit `Settings` object.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

from app.core.config import Settings
from app.main import create_app

pytestmark = pytest.mark.integration


def _settings_for(pg_container: PostgresContainer, redis_container: RedisContainer) -> Settings:
    settings = Settings()
    settings.postgres.host = pg_container.get_container_host_ip()
    settings.postgres.port = int(pg_container.get_exposed_port(5432))
    settings.postgres.user = pg_container.username
    settings.postgres.password = SecretStr(pg_container.password)
    settings.postgres.db = pg_container.dbname
    settings.redis.host = redis_container.get_container_host_ip()
    settings.redis.port = int(redis_container.get_exposed_port(6379))
    return settings


def test_healthz_never_needs_lifespan_state() -> None:
    """/healthz is a pure liveness probe: no app.state, no lifespan needed."""
    app = create_app()
    with TestClient(app) as http:
        resp = http.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_readyz_reports_ready_when_db_and_redis_are_up(
    pg_container: PostgresContainer, redis_container: RedisContainer
) -> None:
    """Lifespan startup wires real engine+redis from the *passed-in* settings.

    This exercises both the lifespan startup path in app/main.py and the
    real check_database/check_redis probes in app/db/health.py.
    """
    app = create_app(settings=_settings_for(pg_container, redis_container))

    with TestClient(app) as http:
        assert hasattr(app.state, "db_engine")
        assert hasattr(app.state, "redis")

        resp = http.get("/readyz")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["checks"]["db"]["status"] == "ok"
    assert body["checks"]["redis"]["status"] == "ok"


def test_readyz_reports_not_ready_when_db_is_unreachable(
    redis_container: RedisContainer,
) -> None:
    """Point Postgres at a port nothing is listening on; /readyz must 503."""
    settings = Settings()
    settings.postgres.host = "127.0.0.1"
    settings.postgres.port = 1  # nothing listens here
    settings.redis.host = redis_container.get_container_host_ip()
    settings.redis.port = int(redis_container.get_exposed_port(6379))

    app = create_app(settings=settings)

    with TestClient(app) as http:
        resp = http.get("/readyz")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["db"]["status"] == "error"
    assert body["checks"]["db"]["detail"] is not None


def test_lifespan_shutdown_disposes_engine_and_closes_redis(
    pg_container: PostgresContainer, redis_container: RedisContainer
) -> None:
    """After the TestClient context exits, shutdown must have run cleanly.

    We can't directly assert "disposed"/"closed" booleans (the underlying
    clients don't expose one), so instead we assert shutdown completes
    without raising and that a second startup+shutdown cycle also works —
    which would fail loudly if dispose()/aclose() left anything half-open.
    """
    settings = _settings_for(pg_container, redis_container)

    for _ in range(2):
        app = create_app(settings=settings)
        with TestClient(app) as http:
            resp = http.get("/readyz")
            assert resp.status_code == 200

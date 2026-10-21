"""Unit tests for the Postgres/Redis readiness probes in `app/db/health.py`.

These are pure async functions over an injected client/engine, so they're
tested with lightweight mocks rather than real testcontainers — the point
here is the branch logic (ok vs. error vs. unexpected response), not whether
a real Postgres/Redis round-trips.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from app.db.health import check_database, check_redis

# ---------------------------------------------------------------------------
# check_database
# ---------------------------------------------------------------------------


async def test_check_database_ok() -> None:
    conn = AsyncMock()
    conn.execute = AsyncMock(return_value=None)

    conn_cm = AsyncMock()
    conn_cm.__aenter__.return_value = conn
    conn_cm.__aexit__.return_value = False

    engine = MagicMock()
    engine.connect.return_value = conn_cm

    result = await check_database(engine)

    assert result == {"status": "ok", "detail": None}
    conn.execute.assert_awaited_once()


async def test_check_database_error_on_connect_failure() -> None:
    engine = MagicMock()
    engine.connect.side_effect = ConnectionRefusedError("could not connect to server")

    result = await check_database(engine)

    assert result["status"] == "error"
    assert "could not connect" in (result["detail"] or "")


async def test_check_database_error_on_execute_failure() -> None:
    conn = AsyncMock()
    conn.execute.side_effect = RuntimeError("syntax error or access rule violation")

    conn_cm = AsyncMock()
    conn_cm.__aenter__.return_value = conn
    conn_cm.__aexit__.return_value = False

    engine = MagicMock()
    engine.connect.return_value = conn_cm

    result = await check_database(engine)

    assert result["status"] == "error"
    assert "syntax error" in (result["detail"] or "")


# ---------------------------------------------------------------------------
# check_redis
# ---------------------------------------------------------------------------


async def test_check_redis_ok_true() -> None:
    client = AsyncMock()
    client.ping.return_value = True

    result = await check_redis(client)

    assert result == {"status": "ok", "detail": None}


async def test_check_redis_ok_pong_string() -> None:
    client = AsyncMock()
    client.ping.return_value = "PONG"

    result = await check_redis(client)

    assert result == {"status": "ok", "detail": None}


async def test_check_redis_unexpected_response_is_error() -> None:
    client = AsyncMock()
    client.ping.return_value = "WEIRD"

    result = await check_redis(client)

    assert result["status"] == "error"
    assert "unexpected ping response" in (result["detail"] or "")


async def test_check_redis_connection_failure_is_error() -> None:
    client = AsyncMock()
    client.ping.side_effect = ConnectionError("Connection refused")

    result = await check_redis(client)

    assert result["status"] == "error"
    assert "Connection refused" in (result["detail"] or "")

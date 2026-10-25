"""Shared pytest fixtures.

Integration tests use real Postgres + Redis via testcontainers.
All async fixtures run on the session event loop (asyncio_default_fixture_loop_scope
= "session" in pyproject.toml) to avoid the asyncpg "Future attached to a
different loop" error.

Isolation: each test function gets its own HTTP client whose dependency
override creates a fresh AsyncSession per HTTP request — exactly like
production, but pointed at the test database.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

from alembic import command
from alembic.config import Config
from app.db.redis import get_redis
from app.db.session import get_db_session
from app.main import create_app

# ---------------------------------------------------------------------------
# Session-scoped containers (spin up once per test run)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def pg_container() -> Iterator[PostgresContainer]:
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture(scope="session")
def redis_container() -> Iterator[RedisContainer]:
    with RedisContainer("redis:7-alpine") as rd:
        yield rd


# ---------------------------------------------------------------------------
# Session-scoped engine (migrations run once, engine shared across all tests)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def db_engine(pg_container: PostgresContainer) -> AsyncIterator[AsyncEngine]:
    host = pg_container.get_container_host_ip()
    port = pg_container.get_exposed_port(5432)
    user = pg_container.username
    password = pg_container.password
    db = pg_container.dbname

    async_dsn = f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{db}"

    # Alembic's env.py calls asyncio.run(), which cannot be called from a
    # running event loop. Run it in a thread so it gets its own loop.
    def _run_migrations() -> None:
        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", async_dsn)
        command.upgrade(alembic_cfg, "head")

    await asyncio.get_event_loop().run_in_executor(None, _run_migrations)

    # NullPool: every session creates its own connection and closes it
    # on release, avoiding "another operation is in progress" from reused
    # asyncpg connections across tests on the shared event loop.
    engine = create_async_engine(async_dsn, poolclass=NullPool)
    yield engine
    await engine.dispose()


# ---------------------------------------------------------------------------
# Redis URL
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def redis_url(redis_container: RedisContainer) -> str:
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    return f"redis://{host}:{port}/0"


@pytest_asyncio.fixture
async def redis_client(redis_url: str) -> AsyncIterator[aioredis.Redis]:
    """Fresh async client against the testcontainer Redis, per test.

    Function-scoped (unlike the session-scoped `db_engine`): redis-py keeps
    a live connection bound to the event loop it first connected on, and
    pytest-asyncio gives each test function its own loop, so a
    session-scoped client would break the moment a second test tried to
    reuse it. SQLAlchemy's engine avoids the same trap via `NullPool`
    (a fresh connection per use); reconnecting per test is the Redis
    equivalent.
    """
    client: aioredis.Redis = aioredis.from_url(redis_url, decode_responses=True)
    yield client
    # Under pytest-asyncio's session-scoped loop + per-test fixture teardown,
    # the loop this connection's socket was opened on can already be gone by
    # the time this runs. The connection closes with the process either way.
    with contextlib.suppress(RuntimeError):
        await client.aclose()


# ---------------------------------------------------------------------------
# Per-test FastAPI test client
#
# The dependency override creates a fresh session per HTTP request, with the
# same commit/rollback semantics as production. No shared session state
# between requests or tests.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(
    db_engine: AsyncEngine, redis_client: aioredis.Redis
) -> AsyncIterator[AsyncClient]:
    """HTTP client backed by the test database and the test Redis."""
    factory = async_sessionmaker(
        db_engine,
        expire_on_commit=False,
        autoflush=False,
        class_=AsyncSession,
    )

    async def _db_override() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            try:
                yield session
                if session.in_transaction():
                    await session.commit()
            except Exception:
                await session.rollback()
                raise

    app = create_app()
    app.dependency_overrides[get_db_session] = _db_override
    app.dependency_overrides[get_redis] = lambda: redis_client

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

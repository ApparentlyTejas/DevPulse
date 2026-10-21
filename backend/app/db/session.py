"""Async session factory + FastAPI dependency.

One `async_sessionmaker` is built per engine. Each HTTP request gets its
own `AsyncSession` via the `get_db_session` dependency. That dependency
encapsulates the begin / commit / rollback / close lifecycle, so route
handlers and services never have to think about it.

Idiomatic SQLAlchemy 2.0 async pattern.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger

logger = get_logger(__name__)


def build_sessionmaker(engine: object) -> async_sessionmaker[AsyncSession]:
    """Build the session factory.

    `expire_on_commit=False` is the right default for async sessions: with
    expiry on, attribute access on an ORM instance after commit triggers
    a (now-closed) DB roundtrip, which blows up in async contexts.
    """
    # The `engine` parameter is typed `object` because typing it as
    # `AsyncEngine` would require importing it here too — keeping this
    # module's import surface minimal makes it easier to mock in tests.
    # That `object` typing means mypy can't match any `async_sessionmaker`
    # overload, so we suppress and rely on the `-> async_sessionmaker[AsyncSession]`
    # return annotation (and tests) to catch a genuinely wrong `engine`.
    return async_sessionmaker(  # type: ignore[call-overload,no-any-return]
        bind=engine,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
        class_=AsyncSession,
    )


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: yields a session, commits on success, rolls back on error.

    Usage in a route:

        @router.get("/foo")
        async def list_foo(db: AsyncSession = Depends(get_db_session)) -> ...:
            ...

    The sessionmaker is pulled off `request.app.state` — set during lifespan
    startup in `app/main.py`. This keeps the dependency stateless.
    """
    sessionmaker: async_sessionmaker[AsyncSession] = request.app.state.db_sessionmaker
    session = sessionmaker()
    try:
        yield session
        # If the handler completed without raising, commit any pending work.
        # Services *should* commit explicitly for clarity; this is a safety net.
        if session.in_transaction():
            await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


# Type alias to keep route signatures clean:
#   async def list_things(db: DbSession) -> ...
DbSession = Annotated[AsyncSession, Depends(get_db_session)]

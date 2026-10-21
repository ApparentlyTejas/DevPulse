"""Unit tests for `app/db/session.py`.

`build_sessionmaker` is tested against a real (lazy, never-connects) async
engine, matching the pattern in `test_db_engine.py`. `get_db_session` is the
FastAPI dependency that encapsulates commit/rollback/close — it's exercised
here directly with a fake `Request`/sessionmaker so the three branches
(commit-on-success, rollback-on-exception, always-close) are each covered
without needing a real database.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.session import build_sessionmaker, get_db_session


def test_build_sessionmaker_returns_async_sessionmaker() -> None:
    engine = create_async_engine("postgresql+asyncpg://u:p@localhost:5432/db")

    factory = build_sessionmaker(engine)

    assert isinstance(factory, async_sessionmaker)
    session = factory()
    assert isinstance(session, AsyncSession)
    assert session.sync_session.autoflush is False


def _fake_request(session: AsyncMock) -> Request:
    """A minimal stand-in for `Request` exposing only `app.state.db_sessionmaker`."""
    state = SimpleNamespace(db_sessionmaker=lambda: session)
    app = SimpleNamespace(state=state)
    return cast(Request, SimpleNamespace(app=app))


def _mock_session(*, in_transaction: bool) -> AsyncMock:
    """An AsyncMock session, with `in_transaction()` overridden to be synchronous.

    `AsyncSession.in_transaction()` is a *sync* method (it just checks internal
    state), unlike commit/rollback/close which are coroutines. `AsyncMock()`
    makes every attribute async by default, so without this override
    `session.in_transaction()` would return an unawaited coroutine object
    (always truthy) instead of the configured bool.
    """
    session = AsyncMock()
    session.in_transaction = MagicMock(return_value=in_transaction)
    return session


async def test_get_db_session_commits_when_in_transaction() -> None:
    session = _mock_session(in_transaction=True)

    agen = get_db_session(_fake_request(session))
    yielded = await agen.__anext__()
    assert yielded is session

    with pytest.raises(StopAsyncIteration):
        await agen.__anext__()

    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()
    session.close.assert_awaited_once()


async def test_get_db_session_skips_commit_when_no_transaction() -> None:
    session = _mock_session(in_transaction=False)

    agen = get_db_session(_fake_request(session))
    await agen.__anext__()

    with pytest.raises(StopAsyncIteration):
        await agen.__anext__()

    session.commit.assert_not_awaited()
    session.close.assert_awaited_once()


async def test_get_db_session_rolls_back_and_reraises_on_exception() -> None:
    session = _mock_session(in_transaction=True)

    agen = get_db_session(_fake_request(session))
    await agen.__anext__()

    with pytest.raises(ValueError, match="boom"):
        await agen.athrow(ValueError("boom"))

    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()
    session.close.assert_awaited_once()

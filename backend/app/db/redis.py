"""Async Redis client + FastAPI dependency.

A single `redis.asyncio.Redis` is built at startup and held on
`app.state.redis`. Like the DB engine, nothing else constructs clients —
they all pull from app state via the dependency.
"""

from __future__ import annotations

from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Request

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def create_redis(settings: Settings) -> aioredis.Redis:
    """Build an async Redis client from settings.

    `decode_responses=True` makes the client return `str` instead of `bytes`
    for GET/HGET/etc., which is what we want for JSON-shaped values.

    `health_check_interval=30` triggers a periodic PING on idle connections;
    same idea as `pool_pre_ping` for SQLAlchemy.
    """
    # redis-py's async stubs don't type `from_url`'s return precisely enough
    # for strict mode (it comes back untyped), so the call + return are
    # suppressed rather than widening this function's own signature.
    client = aioredis.from_url(  # type: ignore[no-untyped-call]
        settings.redis.url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
        health_check_interval=30,
    )
    logger.info("redis.client.created", host=settings.redis.host, port=settings.redis.port)
    return client  # type: ignore[no-any-return]


async def get_redis(request: Request) -> aioredis.Redis:
    """FastAPI dependency: returns the shared Redis client."""
    return request.app.state.redis  # type: ignore[no-any-return]


# Type alias for clean route signatures.
RedisClient = Annotated[aioredis.Redis, Depends(get_redis)]

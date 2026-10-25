"""Redis-backed fixed-window rate limiting.

A FastAPI dependency rather than global middleware: only the AI endpoints
(triage, postmortem) carry a real-money Anthropic API call per request, so
only those need protecting from a buggy or abusive client firing hundreds
of calls a minute. Rate limiting every endpoint uniformly would protect
nothing the DB connection pool doesn't already bound, and would just add
a Redis round trip to requests that don't need one.

Fixed-window (not sliding/token-bucket) is a deliberate simplification: it
allows a short burst right at a window boundary, but costs one Redis round
trip (`INCR` + a one-time `EXPIRE`) instead of a sorted-set dance. The AI
endpoints' actual requirement — "don't let a bug or an abusive client rack
up hundreds of dollars of Claude calls in a minute" — doesn't need
anything stricter than that.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from redis.asyncio import Redis

from app.db.redis import get_redis


class RateLimitExceededError(Exception):
    """Raised when a key has exceeded its limit within the current window."""

    def __init__(self, retry_after_seconds: int) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"rate limit exceeded, retry after {retry_after_seconds}s")


async def check_rate_limit(redis: Redis, key: str, *, limit: int, window_seconds: int) -> None:
    """Increment `key`'s counter; raise once it exceeds `limit` within the window."""
    current = await redis.incr(key)
    if current == 1:
        # Only the request that created the counter sets its expiry, so a
        # concurrent incr from another request can't reset the window.
        await redis.expire(key, window_seconds)
    if current > limit:
        ttl = await redis.ttl(key)
        raise RateLimitExceededError(retry_after_seconds=ttl if ttl > 0 else window_seconds)


def rate_limit_by_org(
    *, scope: str, limit: int, window_seconds: int
) -> Callable[[UUID, Redis], Awaitable[None]]:
    """Build a dependency that rate-limits by `org_id` (a path param on the route).

    Scoped to the org rather than the user: the cost this guards against
    (Claude API spend) is incurred per org regardless of which member of
    that org triggers it. Takes Redis via the `get_redis` dependency (not
    `request.app.state.redis` directly) so tests can override it the same
    way they override the DB session.
    """

    async def dependency(org_id: UUID, redis: Annotated[Redis, Depends(get_redis)]) -> None:
        key = f"ratelimit:{scope}:{org_id}"
        try:
            await check_rate_limit(redis, key, limit=limit, window_seconds=window_seconds)
        except RateLimitExceededError as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: at most {limit} requests per "
                f"{window_seconds}s for this organization.",
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from exc

    return dependency

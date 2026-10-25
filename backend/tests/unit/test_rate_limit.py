"""Unit tests for the Redis-backed fixed-window rate limiter.

Uses a tiny in-memory fake standing in for `redis.asyncio.Redis` (just the
`incr`/`expire`/`ttl` surface `check_rate_limit` actually calls) rather than
mocked return values, since the logic under test is a multi-call sequence
(incr, then conditionally expire, then maybe ttl) that a fake models far
more faithfully than a `MagicMock` with canned returns.
"""

from __future__ import annotations

import pytest

from app.core.rate_limit import RateLimitExceededError, check_rate_limit


class _FakeRedis:
    def __init__(self) -> None:
        self._counts: dict[str, int] = {}
        self._ttls: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    async def expire(self, key: str, seconds: int) -> None:
        self._ttls[key] = seconds

    async def ttl(self, key: str) -> int:
        return self._ttls.get(key, -1)


async def test_allows_requests_under_the_limit() -> None:
    redis = _FakeRedis()
    for _ in range(3):
        await check_rate_limit(redis, "k", limit=3, window_seconds=60)  # type: ignore[arg-type]


async def test_raises_once_limit_is_exceeded() -> None:
    redis = _FakeRedis()
    for _ in range(3):
        await check_rate_limit(redis, "k", limit=3, window_seconds=60)  # type: ignore[arg-type]

    with pytest.raises(RateLimitExceededError):
        await check_rate_limit(redis, "k", limit=3, window_seconds=60)  # type: ignore[arg-type]


async def test_sets_expiry_only_on_first_increment() -> None:
    redis = _FakeRedis()
    await check_rate_limit(redis, "k", limit=5, window_seconds=42)  # type: ignore[arg-type]
    assert redis._ttls["k"] == 42

    redis._ttls["k"] = 999  # simulate the window already ticking down
    await check_rate_limit(redis, "k", limit=5, window_seconds=42)  # type: ignore[arg-type]
    assert redis._ttls["k"] == 999


async def test_retry_after_reflects_remaining_ttl() -> None:
    redis = _FakeRedis()
    await check_rate_limit(redis, "k", limit=1, window_seconds=30)  # type: ignore[arg-type]

    with pytest.raises(RateLimitExceededError) as exc_info:
        await check_rate_limit(redis, "k", limit=1, window_seconds=30)  # type: ignore[arg-type]
    assert exc_info.value.retry_after_seconds == 30


async def test_different_keys_are_independent() -> None:
    redis = _FakeRedis()
    for _ in range(2):
        await check_rate_limit(redis, "a", limit=2, window_seconds=60)  # type: ignore[arg-type]
    # "b" has its own counter, so this must not raise.
    await check_rate_limit(redis, "b", limit=2, window_seconds=60)  # type: ignore[arg-type]

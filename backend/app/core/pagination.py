"""Shared pagination: a query-param dependency + a generic response envelope.

Every list endpoint that can grow without bound (incidents, alert events,
services, ...) uses this instead of returning a bare `list[...]`, so a
heavily-used org can never force the API to materialize and serialize an
unbounded result set in one response.

Endpoints whose cardinality is inherently small and human-bounded (orgs a
user belongs to, members of an org) intentionally keep returning bare
lists — pagination there would add ceremony without buying any real
protection.
"""

from __future__ import annotations

from typing import Annotated, Generic, TypeVar

from fastapi import Depends, Query
from pydantic import BaseModel

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

T = TypeVar("T")


class PageParams:
    """Parsed + bounded `limit`/`offset` query params."""

    def __init__(
        self,
        limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
        offset: int = Query(0, ge=0),
    ) -> None:
        self.limit = limit
        self.offset = offset


Pagination = Annotated[PageParams, Depends()]


class Page(BaseModel, Generic[T]):
    """A page of results plus enough metadata for a client to fetch the rest."""

    items: list[T]
    total: int
    limit: int
    offset: int

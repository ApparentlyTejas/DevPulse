"""Metrics domain service: ingest + query metric snapshots."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.metrics.models import MetricSnapshot
from app.modules.organizations.models import OrganizationMembership
from app.modules.services.models import Service

# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------


class ServiceNotFoundError(Exception):
    pass


class OrgNotFoundError(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _assert_service_in_org(
    db: AsyncSession, org_id: UUID, service_id: UUID, user_id: UUID
) -> Service:
    membership = await db.scalar(
        select(OrganizationMembership)
        .where(OrganizationMembership.organization_id == org_id)
        .where(OrganizationMembership.user_id == user_id)
    )
    if membership is None:
        raise OrgNotFoundError

    service = await db.scalar(
        select(Service).where(Service.id == service_id).where(Service.org_id == org_id)
    )
    if service is None:
        raise ServiceNotFoundError
    return service


# ---------------------------------------------------------------------------
# Metrics operations
# ---------------------------------------------------------------------------


async def ingest(
    db: AsyncSession,
    org_id: UUID,
    service_id: UUID,
    user_id: UUID,
    metric_name: str,
    value: float,
    unit: str | None = None,
    recorded_at: datetime | None = None,
) -> MetricSnapshot:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    snapshot = MetricSnapshot(
        service_id=service_id,
        org_id=org_id,
        metric_name=metric_name,
        value=value,
        unit=unit,
        recorded_at=recorded_at or datetime.now(tz=UTC),
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


async def query(
    db: AsyncSession,
    org_id: UUID,
    service_id: UUID,
    user_id: UUID,
    metric_name: str | None = None,
    limit: int = 100,
) -> list[MetricSnapshot]:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    stmt = (
        select(MetricSnapshot)
        .where(MetricSnapshot.service_id == service_id)
        .where(MetricSnapshot.org_id == org_id)
        .order_by(MetricSnapshot.recorded_at.desc())
        .limit(limit)
    )
    if metric_name is not None:
        stmt = stmt.where(MetricSnapshot.metric_name == metric_name)

    result = await db.execute(stmt)
    return list(result.scalars().all())

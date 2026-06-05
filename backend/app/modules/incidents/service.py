"""Incidents domain service: create + manage incident lifecycle."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.incidents.models import Incident, IncidentSeverity, IncidentStatus
from app.modules.organizations.models import OrganizationMembership
from app.modules.services.models import Service

# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------


class OrgNotFoundError(Exception):
    pass


class ServiceNotFoundError(Exception):
    pass


class IncidentNotFoundError(Exception):
    pass


class InvalidStatusTransitionError(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _assert_org_membership(db: AsyncSession, org_id: UUID, user_id: UUID) -> None:
    membership = await db.scalar(
        select(OrganizationMembership)
        .where(OrganizationMembership.organization_id == org_id)
        .where(OrganizationMembership.user_id == user_id)
    )
    if membership is None:
        raise OrgNotFoundError


_VALID_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    IncidentStatus.OPEN: {IncidentStatus.INVESTIGATING, IncidentStatus.RESOLVED},
    IncidentStatus.INVESTIGATING: {IncidentStatus.IDENTIFIED, IncidentStatus.RESOLVED},
    IncidentStatus.IDENTIFIED: {IncidentStatus.MONITORING, IncidentStatus.RESOLVED},
    IncidentStatus.MONITORING: {IncidentStatus.RESOLVED},
    IncidentStatus.RESOLVED: set(),
}


# ---------------------------------------------------------------------------
# Incident CRUD + lifecycle
# ---------------------------------------------------------------------------


async def create_incident(
    db: AsyncSession,
    org_id: UUID,
    user_id: UUID,
    title: str,
    severity: IncidentSeverity,
    description: str | None = None,
    service_id: UUID | None = None,
) -> Incident:
    await _assert_org_membership(db, org_id, user_id)

    if service_id is not None:
        service = await db.scalar(
            select(Service).where(Service.id == service_id).where(Service.org_id == org_id)
        )
        if service is None:
            raise ServiceNotFoundError

    incident = Incident(
        org_id=org_id,
        service_id=service_id,
        created_by=user_id,
        title=title,
        description=description,
        severity=severity,
        incident_status=IncidentStatus.OPEN,
    )
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return incident


async def list_incidents(db: AsyncSession, org_id: UUID, user_id: UUID) -> list[Incident]:
    await _assert_org_membership(db, org_id, user_id)

    result = await db.execute(
        select(Incident).where(Incident.org_id == org_id).order_by(Incident.created_at.desc())
    )
    return list(result.scalars().all())


async def get_incident(
    db: AsyncSession, org_id: UUID, incident_id: UUID, user_id: UUID
) -> Incident:
    await _assert_org_membership(db, org_id, user_id)

    incident = await db.scalar(
        select(Incident).where(Incident.id == incident_id).where(Incident.org_id == org_id)
    )
    if incident is None:
        raise IncidentNotFoundError
    return incident


async def update_incident(
    db: AsyncSession,
    org_id: UUID,
    incident_id: UUID,
    user_id: UUID,
    title: str | None = None,
    description: str | None = None,
    severity: IncidentSeverity | None = None,
) -> Incident:
    incident = await get_incident(db, org_id, incident_id, user_id)

    if title is not None:
        incident.title = title
    if description is not None:
        incident.description = description
    if severity is not None:
        incident.severity = severity

    await db.commit()
    await db.refresh(incident)
    return incident


async def update_status(
    db: AsyncSession,
    org_id: UUID,
    incident_id: UUID,
    user_id: UUID,
    new_status: IncidentStatus,
) -> Incident:
    incident = await get_incident(db, org_id, incident_id, user_id)

    if new_status not in _VALID_TRANSITIONS[incident.incident_status]:
        raise InvalidStatusTransitionError(
            f"Cannot transition from {incident.incident_status} to {new_status}"
        )

    incident.incident_status = new_status
    if new_status == IncidentStatus.RESOLVED:
        incident.resolved_at = datetime.now(tz=UTC)  # type: ignore[assignment]

    await db.commit()
    await db.refresh(incident)
    return incident


async def delete_incident(db: AsyncSession, org_id: UUID, incident_id: UUID, user_id: UUID) -> None:
    incident = await get_incident(db, org_id, incident_id, user_id)
    await db.delete(incident)
    await db.commit()

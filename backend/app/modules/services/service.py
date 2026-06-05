"""Services domain service: CRUD for monitored services."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organizations.models import Organization, OrganizationMembership
from app.modules.services.models import Service, ServiceStatus

# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------


class ServiceNotFoundError(Exception):
    pass


class SlugAlreadyTakenError(Exception):
    pass


class OrgNotFoundError(Exception):
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


# ---------------------------------------------------------------------------
# Service CRUD
# ---------------------------------------------------------------------------


async def create_service(
    db: AsyncSession,
    org_id: UUID,
    name: str,
    slug: str,
    user_id: UUID,
    description: str | None = None,
    repository_url: str | None = None,
) -> Service:
    await _assert_org_membership(db, org_id, user_id)

    org = await db.get(Organization, org_id)
    if org is None:  # pragma: no cover
        raise OrgNotFoundError

    existing = await db.scalar(
        select(Service)
        .where(Service.org_id == org_id)
        .where(Service.slug == slug.lower())
    )
    if existing is not None:
        raise SlugAlreadyTakenError(slug)

    service = Service(
        org_id=org_id,
        name=name,
        slug=slug.lower(),
        description=description,
        repository_url=repository_url,
        status=ServiceStatus.UNKNOWN,
    )
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return service


async def list_services(db: AsyncSession, org_id: UUID, user_id: UUID) -> list[Service]:
    await _assert_org_membership(db, org_id, user_id)

    result = await db.execute(
        select(Service)
        .where(Service.org_id == org_id)
        .order_by(Service.name)
    )
    return list(result.scalars().all())


async def get_service(db: AsyncSession, org_id: UUID, service_id: UUID, user_id: UUID) -> Service:
    await _assert_org_membership(db, org_id, user_id)

    service = await db.scalar(
        select(Service)
        .where(Service.id == service_id)
        .where(Service.org_id == org_id)
    )
    if service is None:
        raise ServiceNotFoundError
    return service


async def update_service(
    db: AsyncSession,
    org_id: UUID,
    service_id: UUID,
    user_id: UUID,
    name: str | None = None,
    description: str | None = None,
    status: ServiceStatus | None = None,
    repository_url: str | None = None,
) -> Service:
    service = await get_service(db, org_id, service_id, user_id)

    if name is not None:
        service.name = name
    if description is not None:
        service.description = description
    if status is not None:
        service.status = status
    if repository_url is not None:
        service.repository_url = repository_url

    await db.commit()
    await db.refresh(service)
    return service


async def delete_service(
    db: AsyncSession, org_id: UUID, service_id: UUID, user_id: UUID
) -> None:
    service = await get_service(db, org_id, service_id, user_id)
    await db.delete(service)
    await db.commit()

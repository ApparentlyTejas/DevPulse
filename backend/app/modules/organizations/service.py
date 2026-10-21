"""Organizations domain service: org CRUD + membership management."""

from __future__ import annotations

from typing import cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.models import User
from app.modules.organizations.models import Organization, OrganizationMembership, OrgRole

# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------


class OrgNotFoundError(Exception):
    pass


class SlugAlreadyTakenError(Exception):
    pass


class AlreadyMemberError(Exception):
    pass


class MemberNotFoundError(Exception):
    pass


class InsufficientRoleError(Exception):
    pass


class CannotRemoveLastOwnerError(Exception):
    pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_ROLE_RANK: dict[OrgRole, int] = {
    OrgRole.MEMBER: 0,
    OrgRole.ADMIN: 1,
    OrgRole.OWNER: 2,
}


def _require_role(membership: OrganizationMembership, minimum: OrgRole) -> None:
    if _ROLE_RANK[membership.role] < _ROLE_RANK[minimum]:
        raise InsufficientRoleError


async def _get_membership(
    db: AsyncSession, org_id: UUID, user_id: UUID
) -> OrganizationMembership | None:
    # `AsyncSession.scalar` is typed `Any` without the SQLAlchemy mypy plugin
    # (not enabled here alongside pydantic's); the cast documents the actual
    # return type instead of widening the function signature.
    return cast(
        "OrganizationMembership | None",
        await db.scalar(
            select(OrganizationMembership)
            .where(OrganizationMembership.organization_id == org_id)
            .where(OrganizationMembership.user_id == user_id)
        ),
    )


async def _owner_count(db: AsyncSession, org_id: UUID) -> int:
    result = await db.scalar(
        select(func.count())
        .select_from(OrganizationMembership)
        .where(OrganizationMembership.organization_id == org_id)
        .where(OrganizationMembership.role == OrgRole.OWNER)
    )
    return int(result or 0)


async def _fetch_membership_with_user(
    db: AsyncSession, membership_id: UUID
) -> OrganizationMembership:
    result = await db.scalar(
        select(OrganizationMembership)
        .where(OrganizationMembership.id == membership_id)
        .options(selectinload(OrganizationMembership.user))
    )
    if result is None:  # pragma: no cover — should never happen after a flush
        raise MemberNotFoundError
    return result


# ---------------------------------------------------------------------------
# Org CRUD
# ---------------------------------------------------------------------------


async def create_org(db: AsyncSession, name: str, slug: str, owner: User) -> Organization:
    existing = await db.scalar(select(Organization).where(Organization.slug == slug.lower()))
    if existing is not None:
        raise SlugAlreadyTakenError(slug)

    org = Organization(slug=slug.lower(), name=name)
    db.add(org)
    await db.flush()  # get org.id

    membership = OrganizationMembership(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(org)
    return org


async def list_user_orgs(db: AsyncSession, user: User) -> list[Organization]:
    result = await db.execute(
        select(Organization)
        .join(
            OrganizationMembership,
            OrganizationMembership.organization_id == Organization.id,
        )
        .where(OrganizationMembership.user_id == user.id)
        .order_by(Organization.created_at)
    )
    return list(result.scalars().all())


async def get_org(db: AsyncSession, org_id: UUID, user: User) -> Organization:
    membership = await _get_membership(db, org_id, user.id)
    if membership is None:
        raise OrgNotFoundError

    org = await db.get(Organization, org_id)
    if org is None:  # pragma: no cover
        raise OrgNotFoundError
    return org


async def update_org(db: AsyncSession, org_id: UUID, name: str | None, user: User) -> Organization:
    membership = await _get_membership(db, org_id, user.id)
    if membership is None:
        raise OrgNotFoundError
    _require_role(membership, OrgRole.ADMIN)

    org = await db.get(Organization, org_id)
    if org is None:  # pragma: no cover
        raise OrgNotFoundError

    if name is not None:
        org.name = name

    await db.commit()
    await db.refresh(org)
    return org


async def delete_org(db: AsyncSession, org_id: UUID, user: User) -> None:
    membership = await _get_membership(db, org_id, user.id)
    if membership is None:
        raise OrgNotFoundError
    _require_role(membership, OrgRole.OWNER)

    org = await db.get(Organization, org_id)
    if org is None:  # pragma: no cover
        raise OrgNotFoundError

    await db.delete(org)
    await db.commit()


# ---------------------------------------------------------------------------
# Membership management
# ---------------------------------------------------------------------------


async def list_members(db: AsyncSession, org_id: UUID, user: User) -> list[OrganizationMembership]:
    membership = await _get_membership(db, org_id, user.id)
    if membership is None:
        raise OrgNotFoundError

    result = await db.execute(
        select(OrganizationMembership)
        .where(OrganizationMembership.organization_id == org_id)
        .options(selectinload(OrganizationMembership.user))
        .order_by(OrganizationMembership.created_at)
    )
    return list(result.scalars().all())


async def add_member(
    db: AsyncSession,
    org_id: UUID,
    target_user_id: UUID,
    role: OrgRole,
    requester: User,
) -> OrganizationMembership:
    req_membership = await _get_membership(db, org_id, requester.id)
    if req_membership is None:
        raise OrgNotFoundError
    _require_role(req_membership, OrgRole.ADMIN)

    target = await db.get(User, target_user_id)
    if target is None:
        raise MemberNotFoundError("Target user does not exist")

    existing = await _get_membership(db, org_id, target_user_id)
    if existing is not None:
        raise AlreadyMemberError

    membership = OrganizationMembership(
        organization_id=org_id,
        user_id=target_user_id,
        role=role,
    )
    db.add(membership)
    await db.flush()
    await db.commit()
    return await _fetch_membership_with_user(db, membership.id)


async def update_member_role(
    db: AsyncSession,
    org_id: UUID,
    target_user_id: UUID,
    new_role: OrgRole,
    requester: User,
) -> OrganizationMembership:
    req_membership = await _get_membership(db, org_id, requester.id)
    if req_membership is None:
        raise OrgNotFoundError
    _require_role(req_membership, OrgRole.OWNER)

    target_membership = await _get_membership(db, org_id, target_user_id)
    if target_membership is None:
        raise MemberNotFoundError

    if (
        target_membership.role == OrgRole.OWNER
        and new_role != OrgRole.OWNER
        and await _owner_count(db, org_id) <= 1
    ):
        raise CannotRemoveLastOwnerError

    target_membership.role = new_role
    await db.commit()
    return await _fetch_membership_with_user(db, target_membership.id)


async def remove_member(
    db: AsyncSession, org_id: UUID, target_user_id: UUID, requester: User
) -> None:
    req_membership = await _get_membership(db, org_id, requester.id)
    if req_membership is None:
        raise OrgNotFoundError
    _require_role(req_membership, OrgRole.ADMIN)

    target_membership = await _get_membership(db, org_id, target_user_id)
    if target_membership is None:
        raise MemberNotFoundError

    if target_membership.role == OrgRole.OWNER and await _owner_count(db, org_id) <= 1:
        raise CannotRemoveLastOwnerError

    await db.delete(target_membership)
    await db.commit()

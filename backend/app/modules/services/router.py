"""Services HTTP endpoints: CRUD for monitored services within an org."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.db.session import DbSession
from app.modules.auth.deps import CurrentUser
from app.modules.services import service as svc_service
from app.modules.services.schemas import CreateServiceRequest, ServiceOut, UpdateServiceRequest
from app.modules.services.service import (
    OrgNotFoundError,
    ServiceNotFoundError,
    SlugAlreadyTakenError,
)

router = APIRouter()


@router.post(
    "",
    response_model=ServiceOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_service(
    org_id: UUID, req: CreateServiceRequest, db: DbSession, current_user: CurrentUser
) -> ServiceOut:
    try:
        svc = await svc_service.create_service(
            db,
            org_id=org_id,
            name=req.name,
            slug=req.slug,
            user_id=current_user.id,
            description=req.description,
            repository_url=req.repository_url,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except SlugAlreadyTakenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Slug already taken in this org"
        ) from exc
    return ServiceOut.model_validate(svc)


@router.get("", response_model=list[ServiceOut])
async def list_services(
    org_id: UUID, db: DbSession, current_user: CurrentUser
) -> list[ServiceOut]:
    try:
        services = await svc_service.list_services(db, org_id=org_id, user_id=current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    return [ServiceOut.model_validate(s) for s in services]


@router.get("/{service_id}", response_model=ServiceOut)
async def get_service(
    org_id: UUID, service_id: UUID, db: DbSession, current_user: CurrentUser
) -> ServiceOut:
    try:
        svc = await svc_service.get_service(db, org_id, service_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        ) from exc
    return ServiceOut.model_validate(svc)


@router.patch("/{service_id}", response_model=ServiceOut)
async def update_service(
    org_id: UUID,
    service_id: UUID,
    req: UpdateServiceRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ServiceOut:
    try:
        svc = await svc_service.update_service(
            db,
            org_id=org_id,
            service_id=service_id,
            user_id=current_user.id,
            name=req.name,
            description=req.description,
            status=req.status,
            repository_url=req.repository_url,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        ) from exc
    return ServiceOut.model_validate(svc)


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_service(
    org_id: UUID, service_id: UUID, db: DbSession, current_user: CurrentUser
) -> None:
    try:
        await svc_service.delete_service(db, org_id, service_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        ) from exc

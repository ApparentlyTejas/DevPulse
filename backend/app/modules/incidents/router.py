"""Incidents HTTP endpoints: create + manage incident lifecycle within an org."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.db.session import DbSession
from app.modules.auth.deps import CurrentUser
from app.modules.incidents import service as incidents_service
from app.modules.incidents.schemas import (
    CreateIncidentRequest,
    IncidentOut,
    UpdateIncidentRequest,
    UpdateIncidentStatusRequest,
)
from app.modules.incidents.service import (
    IncidentNotFoundError,
    InvalidStatusTransitionError,
    OrgNotFoundError,
    ServiceNotFoundError,
)

router = APIRouter()


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def create_incident(
    org_id: UUID, req: CreateIncidentRequest, db: DbSession, current_user: CurrentUser
) -> IncidentOut:
    try:
        incident = await incidents_service.create_incident(
            db,
            org_id=org_id,
            user_id=current_user.id,
            title=req.title,
            severity=req.severity,
            description=req.description,
            service_id=req.service_id,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    return IncidentOut.model_validate(incident)


@router.get("", response_model=list[IncidentOut])
async def list_incidents(
    org_id: UUID, db: DbSession, current_user: CurrentUser
) -> list[IncidentOut]:
    try:
        incidents = await incidents_service.list_incidents(db, org_id=org_id, user_id=current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    return [IncidentOut.model_validate(i) for i in incidents]


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(
    org_id: UUID, incident_id: UUID, db: DbSession, current_user: CurrentUser
) -> IncidentOut:
    try:
        incident = await incidents_service.get_incident(db, org_id, incident_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found") from exc
    return IncidentOut.model_validate(incident)


@router.patch("/{incident_id}", response_model=IncidentOut)
async def update_incident(
    org_id: UUID,
    incident_id: UUID,
    req: UpdateIncidentRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> IncidentOut:
    try:
        incident = await incidents_service.update_incident(
            db,
            org_id=org_id,
            incident_id=incident_id,
            user_id=current_user.id,
            title=req.title,
            description=req.description,
            severity=req.severity,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found") from exc
    return IncidentOut.model_validate(incident)


@router.patch("/{incident_id}/status", response_model=IncidentOut)
async def update_incident_status(
    org_id: UUID,
    incident_id: UUID,
    req: UpdateIncidentStatusRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> IncidentOut:
    try:
        incident = await incidents_service.update_status(
            db, org_id, incident_id, current_user.id, req.incident_status
        )
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found") from exc
    except InvalidStatusTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return IncidentOut.model_validate(incident)


@router.delete("/{incident_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_incident(
    org_id: UUID, incident_id: UUID, db: DbSession, current_user: CurrentUser
) -> None:
    try:
        await incidents_service.delete_incident(db, org_id, incident_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found") from exc

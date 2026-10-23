"""AI triage and postmortem HTTP endpoints, nested under incidents."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.db.session import DbSession
from app.modules.ai import service as ai_service
from app.modules.ai.schemas import IncidentTriageOut, PostmortemOut
from app.modules.ai.service import AITriageError, IncidentNotFoundError, OrgNotFoundError
from app.modules.auth.deps import CurrentUser

router = APIRouter()


@router.post(
    "/triage",
    response_model=IncidentTriageOut,
    status_code=status.HTTP_201_CREATED,
)
async def triage_incident(
    org_id: UUID, incident_id: UUID, db: DbSession, current_user: CurrentUser
) -> IncidentTriageOut:
    try:
        triage = await ai_service.triage_incident(
            db, get_settings(), org_id, incident_id, current_user.id
        )
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        ) from exc
    except AITriageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI triage failed: {exc}",
        ) from exc
    return IncidentTriageOut.model_validate(triage)


@router.get("/triage", response_model=list[IncidentTriageOut])
async def list_triages(
    org_id: UUID, incident_id: UUID, db: DbSession, current_user: CurrentUser
) -> list[IncidentTriageOut]:
    try:
        triages = await ai_service.list_triages(db, org_id, incident_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        ) from exc
    return [IncidentTriageOut.model_validate(t) for t in triages]


@router.post(
    "/postmortem",
    response_model=PostmortemOut,
    status_code=status.HTTP_201_CREATED,
)
async def generate_postmortem(
    org_id: UUID, incident_id: UUID, db: DbSession, current_user: CurrentUser
) -> PostmortemOut:
    try:
        postmortem = await ai_service.generate_postmortem(
            db, get_settings(), org_id, incident_id, current_user.id
        )
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        ) from exc
    except AITriageError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Postmortem generation failed: {exc}",
        ) from exc
    return PostmortemOut.model_validate(postmortem)


@router.get("/postmortem", response_model=list[PostmortemOut])
async def list_postmortems(
    org_id: UUID, incident_id: UUID, db: DbSession, current_user: CurrentUser
) -> list[PostmortemOut]:
    try:
        postmortems = await ai_service.list_postmortems(db, org_id, incident_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except IncidentNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        ) from exc
    return [PostmortemOut.model_validate(p) for p in postmortems]

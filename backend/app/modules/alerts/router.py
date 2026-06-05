"""Alerts HTTP endpoints: alert rules + alert event lifecycle."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.db.session import DbSession
from app.modules.alerts import service as alerts_service
from app.modules.alerts.schemas import (
    AlertEventOut,
    AlertRuleOut,
    CreateAlertEventRequest,
    CreateAlertRuleRequest,
    UpdateAlertEventStatusRequest,
    UpdateAlertRuleRequest,
)
from app.modules.alerts.service import (
    AlertEventNotFoundError,
    AlertRuleNotFoundError,
    InvalidStatusTransitionError,
    OrgNotFoundError,
    ServiceNotFoundError,
)
from app.modules.auth.deps import CurrentUser

router = APIRouter()


# ---------------------------------------------------------------------------
# Alert rules
# ---------------------------------------------------------------------------


@router.post(
    "/rules",
    response_model=AlertRuleOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_rule(
    org_id: UUID,
    service_id: UUID,
    req: CreateAlertRuleRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> AlertRuleOut:
    try:
        rule = await alerts_service.create_rule(
            db,
            org_id=org_id,
            service_id=service_id,
            user_id=current_user.id,
            name=req.name,
            metric_name=req.metric_name,
            condition_operator=req.condition_operator,
            threshold=req.threshold,
            window_seconds=req.window_seconds,
            severity=req.severity,
            is_enabled=req.is_enabled,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    return AlertRuleOut.model_validate(rule)


@router.get("/rules", response_model=list[AlertRuleOut])
async def list_rules(
    org_id: UUID, service_id: UUID, db: DbSession, current_user: CurrentUser
) -> list[AlertRuleOut]:
    try:
        rules = await alerts_service.list_rules(db, org_id, service_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    return [AlertRuleOut.model_validate(r) for r in rules]


@router.get("/rules/{rule_id}", response_model=AlertRuleOut)
async def get_rule(
    org_id: UUID, service_id: UUID, rule_id: UUID, db: DbSession, current_user: CurrentUser
) -> AlertRuleOut:
    try:
        rule = await alerts_service.get_rule(db, org_id, service_id, rule_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    except AlertRuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found") from exc
    return AlertRuleOut.model_validate(rule)


@router.patch("/rules/{rule_id}", response_model=AlertRuleOut)
async def update_rule(
    org_id: UUID,
    service_id: UUID,
    rule_id: UUID,
    req: UpdateAlertRuleRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> AlertRuleOut:
    try:
        rule = await alerts_service.update_rule(
            db,
            org_id=org_id,
            service_id=service_id,
            rule_id=rule_id,
            user_id=current_user.id,
            name=req.name,
            threshold=req.threshold,
            window_seconds=req.window_seconds,
            severity=req.severity,
            is_enabled=req.is_enabled,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    except AlertRuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found") from exc
    return AlertRuleOut.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_rule(
    org_id: UUID, service_id: UUID, rule_id: UUID, db: DbSession, current_user: CurrentUser
) -> None:
    try:
        await alerts_service.delete_rule(db, org_id, service_id, rule_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    except AlertRuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found") from exc


# ---------------------------------------------------------------------------
# Alert events
# ---------------------------------------------------------------------------


@router.post(
    "/events",
    response_model=AlertEventOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_event(
    org_id: UUID,
    service_id: UUID,
    req: CreateAlertEventRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> AlertEventOut:
    try:
        event = await alerts_service.create_event(
            db,
            org_id=org_id,
            service_id=service_id,
            user_id=current_user.id,
            title=req.title,
            severity=req.severity,
            message=req.message,
            rule_id=req.rule_id,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    return AlertEventOut.model_validate(event)


@router.get("/events", response_model=list[AlertEventOut])
async def list_events(
    org_id: UUID, service_id: UUID, db: DbSession, current_user: CurrentUser
) -> list[AlertEventOut]:
    try:
        events = await alerts_service.list_events(db, org_id, service_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    return [AlertEventOut.model_validate(e) for e in events]


@router.get("/events/{event_id}", response_model=AlertEventOut)
async def get_event(
    org_id: UUID, service_id: UUID, event_id: UUID, db: DbSession, current_user: CurrentUser
) -> AlertEventOut:
    try:
        event = await alerts_service.get_event(db, org_id, service_id, event_id, current_user.id)
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    except AlertEventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert event not found") from exc
    return AlertEventOut.model_validate(event)


@router.patch("/events/{event_id}/status", response_model=AlertEventOut)
async def update_event_status(
    org_id: UUID,
    service_id: UUID,
    event_id: UUID,
    req: UpdateAlertEventStatusRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> AlertEventOut:
    try:
        event = await alerts_service.update_event_status(
            db, org_id, service_id, event_id, current_user.id, req.alert_status
        )
    except OrgNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found") from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found") from exc
    except AlertEventNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert event not found") from exc
    except InvalidStatusTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return AlertEventOut.model_validate(event)

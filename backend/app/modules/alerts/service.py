"""Alerts domain service: alert rules + alert event lifecycle."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.alerts.models import (
    AlertEvent,
    AlertRule,
    AlertSeverity,
    AlertStatus,
    ConditionOperator,
)
from app.modules.organizations.models import OrganizationMembership
from app.modules.services.models import Service

# ---------------------------------------------------------------------------
# Domain errors
# ---------------------------------------------------------------------------


class OrgNotFoundError(Exception):
    pass


class ServiceNotFoundError(Exception):
    pass


class AlertRuleNotFoundError(Exception):
    pass


class AlertEventNotFoundError(Exception):
    pass


class InvalidStatusTransitionError(Exception):
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
        select(Service)
        .where(Service.id == service_id)
        .where(Service.org_id == org_id)
    )
    if service is None:
        raise ServiceNotFoundError
    return service


# ---------------------------------------------------------------------------
# Alert rules
# ---------------------------------------------------------------------------


async def create_rule(
    db: AsyncSession,
    org_id: UUID,
    service_id: UUID,
    user_id: UUID,
    name: str,
    metric_name: str,
    condition_operator: ConditionOperator,
    threshold: float,
    window_seconds: int = 300,
    severity: AlertSeverity = AlertSeverity.WARNING,
    is_enabled: bool = True,
) -> AlertRule:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    rule = AlertRule(
        org_id=org_id,
        service_id=service_id,
        name=name,
        metric_name=metric_name,
        condition_operator=condition_operator,
        threshold=threshold,
        window_seconds=window_seconds,
        severity=severity,
        is_enabled=is_enabled,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def list_rules(
    db: AsyncSession, org_id: UUID, service_id: UUID, user_id: UUID
) -> list[AlertRule]:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.service_id == service_id)
        .where(AlertRule.org_id == org_id)
        .order_by(AlertRule.created_at)
    )
    return list(result.scalars().all())


async def get_rule(
    db: AsyncSession, org_id: UUID, service_id: UUID, rule_id: UUID, user_id: UUID
) -> AlertRule:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    rule = await db.scalar(
        select(AlertRule)
        .where(AlertRule.id == rule_id)
        .where(AlertRule.service_id == service_id)
        .where(AlertRule.org_id == org_id)
    )
    if rule is None:
        raise AlertRuleNotFoundError
    return rule


async def update_rule(
    db: AsyncSession,
    org_id: UUID,
    service_id: UUID,
    rule_id: UUID,
    user_id: UUID,
    name: str | None = None,
    threshold: float | None = None,
    window_seconds: int | None = None,
    severity: AlertSeverity | None = None,
    is_enabled: bool | None = None,
) -> AlertRule:
    rule = await get_rule(db, org_id, service_id, rule_id, user_id)

    if name is not None:
        rule.name = name
    if threshold is not None:
        rule.threshold = threshold
    if window_seconds is not None:
        rule.window_seconds = window_seconds
    if severity is not None:
        rule.severity = severity
    if is_enabled is not None:
        rule.is_enabled = is_enabled

    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(
    db: AsyncSession, org_id: UUID, service_id: UUID, rule_id: UUID, user_id: UUID
) -> None:
    rule = await get_rule(db, org_id, service_id, rule_id, user_id)
    await db.delete(rule)
    await db.commit()


# ---------------------------------------------------------------------------
# Alert events
# ---------------------------------------------------------------------------


async def create_event(
    db: AsyncSession,
    org_id: UUID,
    service_id: UUID,
    user_id: UUID,
    title: str,
    severity: AlertSeverity,
    message: str | None = None,
    rule_id: UUID | None = None,
) -> AlertEvent:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    event = AlertEvent(
        org_id=org_id,
        service_id=service_id,
        rule_id=rule_id,
        severity=severity,
        title=title,
        message=message,
        alert_status=AlertStatus.OPEN,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def list_events(
    db: AsyncSession, org_id: UUID, service_id: UUID, user_id: UUID
) -> list[AlertEvent]:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    result = await db.execute(
        select(AlertEvent)
        .where(AlertEvent.service_id == service_id)
        .where(AlertEvent.org_id == org_id)
        .order_by(AlertEvent.created_at.desc())
    )
    return list(result.scalars().all())


async def get_event(
    db: AsyncSession, org_id: UUID, service_id: UUID, event_id: UUID, user_id: UUID
) -> AlertEvent:
    await _assert_service_in_org(db, org_id, service_id, user_id)

    event = await db.scalar(
        select(AlertEvent)
        .where(AlertEvent.id == event_id)
        .where(AlertEvent.service_id == service_id)
        .where(AlertEvent.org_id == org_id)
    )
    if event is None:
        raise AlertEventNotFoundError
    return event


_VALID_TRANSITIONS: dict[AlertStatus, set[AlertStatus]] = {
    AlertStatus.OPEN: {AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED},
    AlertStatus.ACKNOWLEDGED: {AlertStatus.RESOLVED},
    AlertStatus.RESOLVED: set(),
}


async def update_event_status(
    db: AsyncSession,
    org_id: UUID,
    service_id: UUID,
    event_id: UUID,
    user_id: UUID,
    new_status: AlertStatus,
) -> AlertEvent:
    event = await get_event(db, org_id, service_id, event_id, user_id)

    if new_status not in _VALID_TRANSITIONS[event.alert_status]:
        raise InvalidStatusTransitionError(
            f"Cannot transition from {event.alert_status} to {new_status}"
        )

    now = datetime.now(tz=UTC)
    event.alert_status = new_status
    if new_status == AlertStatus.ACKNOWLEDGED:
        event.acknowledged_at = now  # type: ignore[assignment]
    elif new_status == AlertStatus.RESOLVED:
        event.resolved_at = now  # type: ignore[assignment]

    await db.commit()
    await db.refresh(event)
    return event

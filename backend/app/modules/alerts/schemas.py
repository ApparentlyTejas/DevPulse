"""Pydantic schemas for the alerts domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.alerts.models import AlertSeverity, AlertStatus, ConditionOperator

# ---------------------------------------------------------------------------
# Alert rules
# ---------------------------------------------------------------------------


class CreateAlertRuleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    metric_name: str = Field(min_length=1, max_length=100)
    condition_operator: ConditionOperator
    threshold: float
    window_seconds: int = Field(300, ge=10, le=86400)
    severity: AlertSeverity = AlertSeverity.WARNING
    is_enabled: bool = True


class UpdateAlertRuleRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    threshold: float | None = None
    window_seconds: int | None = Field(None, ge=10, le=86400)
    severity: AlertSeverity | None = None
    is_enabled: bool | None = None


class AlertRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    service_id: UUID
    name: str
    metric_name: str
    condition_operator: ConditionOperator
    threshold: float
    window_seconds: int
    severity: AlertSeverity
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Alert events
# ---------------------------------------------------------------------------


class CreateAlertEventRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str | None = Field(None, max_length=2000)
    severity: AlertSeverity
    rule_id: UUID | None = None


class UpdateAlertEventStatusRequest(BaseModel):
    alert_status: AlertStatus


class AlertEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    service_id: UUID
    rule_id: UUID | None
    severity: AlertSeverity
    title: str
    message: str | None
    alert_status: AlertStatus
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime

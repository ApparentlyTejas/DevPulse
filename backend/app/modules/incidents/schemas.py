"""Pydantic schemas for the incidents domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.incidents.models import IncidentSeverity, IncidentStatus


class CreateIncidentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(None, max_length=5000)
    severity: IncidentSeverity
    service_id: UUID | None = None


class UpdateIncidentRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=5000)
    severity: IncidentSeverity | None = None


class UpdateIncidentStatusRequest(BaseModel):
    incident_status: IncidentStatus


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    service_id: UUID | None
    created_by: UUID | None
    title: str
    description: str | None
    severity: IncidentSeverity
    incident_status: IncidentStatus
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime

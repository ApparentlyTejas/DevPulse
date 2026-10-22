"""Pydantic schemas for the AI triage domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.modules.incidents.models import IncidentSeverity


class IncidentTriageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    incident_id: UUID
    summary: str
    suggested_severity: IncidentSeverity | None
    confidence: float
    model: str
    created_at: datetime

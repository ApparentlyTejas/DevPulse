"""Pydantic schemas for the metrics domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class IngestMetricRequest(BaseModel):
    metric_name: str = Field(min_length=1, max_length=100)
    value: float
    unit: str | None = Field(None, max_length=32)
    recorded_at: datetime | None = None


class MetricSnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    service_id: UUID
    org_id: UUID
    metric_name: str
    value: float
    unit: str | None
    recorded_at: datetime
    created_at: datetime


class MetricQueryParams(BaseModel):
    metric_name: str | None = Field(None, max_length=100)
    limit: int = Field(100, ge=1, le=1000)

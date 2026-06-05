"""Pydantic schemas for the services domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.services.models import ServiceStatus


class CreateServiceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(
        min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
    )
    description: str | None = Field(None, max_length=500)
    repository_url: str | None = Field(None, max_length=500)


class UpdateServiceRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    description: str | None = Field(None, max_length=500)
    status: ServiceStatus | None = None
    repository_url: str | None = Field(None, max_length=500)


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    name: str
    slug: str
    description: str | None
    status: ServiceStatus
    repository_url: str | None
    created_at: datetime
    updated_at: datetime

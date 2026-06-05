"""SQLAlchemy model for incidents.

An `Incident` records a service disruption or operational event. It is
scoped to an org, optionally linked to a specific service, and carries
a severity + status that advances through a defined lifecycle.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.models import User
    from app.modules.services.models import Service


class IncidentSeverity(str, enum.Enum):
    SEV1 = "sev1"  # complete outage
    SEV2 = "sev2"  # major degradation
    SEV3 = "sev3"  # minor degradation
    SEV4 = "sev4"  # informational


class IncidentStatus(str, enum.Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    IDENTIFIED = "identified"
    MONITORING = "monitoring"
    RESOLVED = "resolved"


class Incident(Base, TimestampMixin):
    __tablename__ = "incidents"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable: org-level incidents may not be tied to a single service.
    service_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Keep history even if the creating user is later deleted.
    created_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(5000), nullable=True)
    severity: Mapped[IncidentSeverity] = mapped_column(
        Enum(
            IncidentSeverity,
            name="incident_severity",
            native_enum=False,
            length=10,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    incident_status: Mapped[IncidentStatus] = mapped_column(
        Enum(
            IncidentStatus,
            name="incident_status",
            native_enum=False,
            length=20,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=IncidentStatus.OPEN,
        server_default=text("'open'"),
    )
    resolved_at: Mapped[None] = mapped_column(DateTime(timezone=True), nullable=True)

    service: Mapped[Service | None] = relationship(back_populates="incidents")
    creator: Mapped[User | None] = relationship("User")

    __table_args__ = (
        Index("ix_incidents_org_id", "org_id"),
        Index("ix_incidents_service_id", "service_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Incident {self.title!r} status={self.incident_status}>"

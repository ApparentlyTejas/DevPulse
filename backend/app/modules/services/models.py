"""SQLAlchemy models for the services domain.

A `Service` represents a monitored application or infrastructure component
that belongs to an organization. Services are the central entity that
metrics, alerts, and incidents attach to.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.alerts.models import AlertEvent, AlertRule
    from app.modules.incidents.models import Incident
    from app.modules.metrics.models import MetricSnapshot
    from app.modules.organizations.models import Organization


class ServiceStatus(str, enum.Enum):
    UNKNOWN = "unknown"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"


class Service(Base, TimestampMixin):
    __tablename__ = "services"

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
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # URL-safe slug, unique within the org.
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[ServiceStatus] = mapped_column(
        Enum(
            ServiceStatus,
            name="service_status",
            native_enum=False,
            length=20,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=ServiceStatus.UNKNOWN,
        server_default=text("'unknown'"),
    )
    repository_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    organization: Mapped[Organization] = relationship("Organization")
    metric_snapshots: Mapped[list[MetricSnapshot]] = relationship(
        back_populates="service",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    alert_rules: Mapped[list[AlertRule]] = relationship(
        back_populates="service",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    alert_events: Mapped[list[AlertEvent]] = relationship(
        back_populates="service",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    incidents: Mapped[list[Incident]] = relationship(
        back_populates="service",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_services_org_slug"),
        Index("ix_services_org_id", "org_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Service {self.slug!r} org={self.org_id}>"

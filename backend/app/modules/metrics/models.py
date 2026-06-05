"""SQLAlchemy model for metric snapshots.

`MetricSnapshot` is an append-only time-series table. Each row records
a single named metric value for a service at a point in time. Keeping
`org_id` denormalized here avoids a join when querying across services
for an org-level dashboard.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.modules.services.models import Service


class MetricSnapshot(Base):
    """A single time-series data point for a service metric."""

    __tablename__ = "metric_snapshots"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    service_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Denormalized for efficient org-level queries.
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # When the metric was actually measured (may differ from created_at if
    # the ingest is delayed or backfilled).
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    service: Mapped[Service] = relationship(back_populates="metric_snapshots")

    __table_args__ = (
        Index("ix_metric_snapshots_service_metric_time", "service_id", "metric_name", "recorded_at"),
        Index("ix_metric_snapshots_org_id", "org_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MetricSnapshot service={self.service_id} {self.metric_name}={self.value}>"

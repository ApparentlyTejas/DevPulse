"""SQLAlchemy models for the alerts domain.

`AlertRule` defines a threshold condition on a named metric.
`AlertEvent` is a fired alert instance — it tracks lifecycle from open
through acknowledged to resolved.
"""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.services.models import Service


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class ConditionOperator(str, enum.Enum):
    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    EQ = "eq"


class AlertStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class AlertRule(Base, TimestampMixin):
    __tablename__ = "alert_rules"

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
    service_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    condition_operator: Mapped[ConditionOperator] = mapped_column(
        Enum(
            ConditionOperator,
            name="condition_operator",
            native_enum=False,
            length=10,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    # Lookback window in seconds for metric aggregation.
    window_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(
            AlertSeverity,
            name="alert_severity",
            native_enum=False,
            length=10,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=AlertSeverity.WARNING,
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )

    service: Mapped[Service] = relationship(back_populates="alert_rules")
    events: Mapped[list[AlertEvent]] = relationship(
        back_populates="rule",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("ix_alert_rules_org_id", "org_id"),
        Index("ix_alert_rules_service_id", "service_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AlertRule {self.name!r} service={self.service_id}>"


class AlertEvent(Base, TimestampMixin):
    __tablename__ = "alert_events"

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
    service_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable: events can be created manually without a rule.
    rule_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("alert_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(
            AlertSeverity,
            name="alert_severity",
            native_enum=False,
            length=10,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    alert_status: Mapped[AlertStatus] = mapped_column(
        Enum(
            AlertStatus,
            name="alert_status",
            native_enum=False,
            length=20,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=AlertStatus.OPEN,
        server_default=text("'open'"),
    )
    acknowledged_at: Mapped[None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[None] = mapped_column(DateTime(timezone=True), nullable=True)

    service: Mapped[Service] = relationship(back_populates="alert_events")
    rule: Mapped[AlertRule | None] = relationship(back_populates="events")

    __table_args__ = (
        Index("ix_alert_events_org_id", "org_id"),
        Index("ix_alert_events_service_id", "service_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AlertEvent {self.title!r} status={self.alert_status}>"

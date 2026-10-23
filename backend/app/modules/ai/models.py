"""SQLAlchemy models for AI incident triage and postmortem generation.

Each `IncidentTriage` row is one Claude triage run against an incident, and
each `Postmortem` row is one generated postmortem document. Both keep every
run (rather than a single mutable column on `Incident`) so a history is
visible — useful once an incident has been re-triaged, or re-written, after
new information came in.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum, Float, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.modules.incidents.models import IncidentSeverity

if TYPE_CHECKING:
    from app.modules.incidents.models import Incident


class IncidentTriage(Base, TimestampMixin):
    __tablename__ = "incident_triages"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    incident_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(String(2000), nullable=False)
    suggested_severity: Mapped[IncidentSeverity | None] = mapped_column(
        Enum(
            IncidentSeverity,
            name="incident_triage_suggested_severity",
            native_enum=False,
            length=10,
            validate_strings=True,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=True,
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    incident: Mapped[Incident] = relationship(back_populates="triages")

    __table_args__ = (Index("ix_incident_triages_incident_id", "incident_id"),)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<IncidentTriage incident_id={self.incident_id} confidence={self.confidence}>"


class Postmortem(Base, TimestampMixin):
    __tablename__ = "postmortems"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    incident_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    incident: Mapped[Incident] = relationship(back_populates="postmortems")

    __table_args__ = (Index("ix_postmortems_incident_id", "incident_id"),)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Postmortem incident_id={self.incident_id}>"

"""SQLAlchemy model for AI incident triage results.

Each `IncidentTriage` row is one Claude triage run against an incident. We
keep every run (rather than a single mutable "current triage" column on
`Incident`) so a triage history is visible — useful once an incident has
been re-triaged after new information came in.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Float, ForeignKey, Index, String, text
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
        String(10),
        nullable=True,
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    incident: Mapped[Incident] = relationship(back_populates="triages")

    __table_args__ = (Index("ix_incident_triages_incident_id", "incident_id"),)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<IncidentTriage incident_id={self.incident_id} confidence={self.confidence}>"

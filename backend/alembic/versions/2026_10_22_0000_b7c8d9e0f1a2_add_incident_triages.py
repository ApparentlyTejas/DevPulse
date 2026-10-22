"""add incident_triages

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-10-22 00:00:00.000000+00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "incident_triages",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("incident_id", sa.UUID(), nullable=False),
        sa.Column("summary", sa.String(length=2000), nullable=False),
        sa.Column(
            "suggested_severity",
            sa.String(length=10),
            nullable=True,
        ),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["incident_id"],
            ["incidents.id"],
            name=op.f("fk_incident_triages_incident_id_incidents"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_incident_triages")),
    )
    op.create_index(
        "ix_incident_triages_incident_id", "incident_triages", ["incident_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_incident_triages_incident_id", table_name="incident_triages")
    op.drop_table("incident_triages")

"""add services metrics alerts incidents

Revision ID: a1b2c3d4e5f6
Revises: f5e52e5a7bfc
Create Date: 2026-06-05 00:00:00.000000+00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f5e52e5a7bfc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # services
    # ------------------------------------------------------------------
    op.create_table(
        "services",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "unknown", "healthy", "degraded", "down",
                name="service_status",
                native_enum=False,
                length=20,
            ),
            server_default=sa.text("'unknown'"),
            nullable=False,
        ),
        sa.Column("repository_url", sa.String(length=500), nullable=True),
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
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_services_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_services")),
        sa.UniqueConstraint("org_id", "slug", name="uq_services_org_slug"),
    )
    op.create_index("ix_services_org_id", "services", ["org_id"], unique=False)

    # ------------------------------------------------------------------
    # metric_snapshots
    # ------------------------------------------------------------------
    op.create_table(
        "metric_snapshots",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("service_id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("metric_name", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_metric_snapshots_service_id_services"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_metric_snapshots_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_metric_snapshots")),
    )
    op.create_index(
        "ix_metric_snapshots_service_metric_time",
        "metric_snapshots",
        ["service_id", "metric_name", "recorded_at"],
        unique=False,
    )
    op.create_index("ix_metric_snapshots_org_id", "metric_snapshots", ["org_id"], unique=False)

    # ------------------------------------------------------------------
    # alert_rules
    # ------------------------------------------------------------------
    op.create_table(
        "alert_rules",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("service_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("metric_name", sa.String(length=100), nullable=False),
        sa.Column(
            "condition_operator",
            sa.Enum(
                "gt", "gte", "lt", "lte", "eq",
                name="condition_operator",
                native_enum=False,
                length=10,
            ),
            nullable=False,
        ),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("window_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "severity",
            sa.Enum(
                "info", "warning", "critical",
                name="alert_severity",
                native_enum=False,
                length=10,
            ),
            nullable=False,
        ),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_alert_rules_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_alert_rules_service_id_services"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_alert_rules")),
    )
    op.create_index("ix_alert_rules_org_id", "alert_rules", ["org_id"], unique=False)
    op.create_index("ix_alert_rules_service_id", "alert_rules", ["service_id"], unique=False)

    # ------------------------------------------------------------------
    # alert_events
    # ------------------------------------------------------------------
    op.create_table(
        "alert_events",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("service_id", sa.UUID(), nullable=False),
        sa.Column("rule_id", sa.UUID(), nullable=True),
        sa.Column(
            "severity",
            sa.Enum(
                "info", "warning", "critical",
                name="alert_severity",
                native_enum=False,
                length=10,
            ),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.String(length=2000), nullable=True),
        sa.Column(
            "alert_status",
            sa.Enum(
                "open", "acknowledged", "resolved",
                name="alert_status",
                native_enum=False,
                length=20,
            ),
            server_default=sa.text("'open'"),
            nullable=False,
        ),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
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
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_alert_events_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_alert_events_service_id_services"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["rule_id"],
            ["alert_rules.id"],
            name=op.f("fk_alert_events_rule_id_alert_rules"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_alert_events")),
    )
    op.create_index("ix_alert_events_org_id", "alert_events", ["org_id"], unique=False)
    op.create_index("ix_alert_events_service_id", "alert_events", ["service_id"], unique=False)

    # ------------------------------------------------------------------
    # incidents
    # ------------------------------------------------------------------
    op.create_table(
        "incidents",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("service_id", sa.UUID(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=5000), nullable=True),
        sa.Column(
            "severity",
            sa.Enum(
                "sev1", "sev2", "sev3", "sev4",
                name="incident_severity",
                native_enum=False,
                length=10,
            ),
            nullable=False,
        ),
        sa.Column(
            "incident_status",
            sa.Enum(
                "open", "investigating", "identified", "monitoring", "resolved",
                name="incident_status",
                native_enum=False,
                length=20,
            ),
            server_default=sa.text("'open'"),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
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
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_incidents_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["service_id"],
            ["services.id"],
            name=op.f("fk_incidents_service_id_services"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_incidents_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_incidents")),
    )
    op.create_index("ix_incidents_org_id", "incidents", ["org_id"], unique=False)
    op.create_index("ix_incidents_service_id", "incidents", ["service_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_incidents_service_id", table_name="incidents")
    op.drop_index("ix_incidents_org_id", table_name="incidents")
    op.drop_table("incidents")

    op.drop_index("ix_alert_events_service_id", table_name="alert_events")
    op.drop_index("ix_alert_events_org_id", table_name="alert_events")
    op.drop_table("alert_events")

    op.drop_index("ix_alert_rules_service_id", table_name="alert_rules")
    op.drop_index("ix_alert_rules_org_id", table_name="alert_rules")
    op.drop_table("alert_rules")

    op.drop_index("ix_metric_snapshots_org_id", table_name="metric_snapshots")
    op.drop_index("ix_metric_snapshots_service_metric_time", table_name="metric_snapshots")
    op.drop_table("metric_snapshots")

    op.drop_index("ix_services_org_id", table_name="services")
    op.drop_table("services")

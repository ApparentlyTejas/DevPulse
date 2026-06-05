"""Alembic migration environment, async-aware.

Runtime entrypoint Alembic calls for every `alembic upgrade`, `downgrade`,
and `autogenerate`. We do three non-default things:

1. Pull the DSN from our pydantic-settings, not from alembic.ini. Single
   source of truth: same config the app uses.
2. Use the async engine pattern. SQLAlchemy 2.0's
   `async_engine_from_config` + `conn.run_sync(do_run_migrations)` lets
   Alembic (which is sync) ride on an async connection.
3. Import every domain's models so they register on `Base.metadata`. Until
   we have any (Phase 1 step 7+), the import list is empty — that's fine.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.core.config import get_settings
from app.db.base import Base

# -----------------------------------------------------------------------------
# Import all model modules below so they register against Base.metadata.
# Each new domain module's models.py gets imported here.
# -----------------------------------------------------------------------------
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.organizations import models as _org_models  # noqa: F401
from app.modules.services import models as _services_models  # noqa: F401
from app.modules.metrics import models as _metrics_models  # noqa: F401
from app.modules.alerts import models as _alerts_models  # noqa: F401
from app.modules.incidents import models as _incidents_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Only inject the app DSN when Alembic is invoked directly (sqlalchemy.url is
# empty in alembic.ini).  Tests override this via Config.set_main_option()
# before calling command.upgrade(), so we must not stomp on their value.
if not config.get_main_option("sqlalchemy.url"):
    settings = get_settings()
    config.set_main_option("sqlalchemy.url", settings.postgres.dsn)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL without connecting (alembic upgrade --sql)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Sync migration runner; called via `run_sync` from the async path."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        include_schemas=False,
        render_as_batch=False,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Online migrations against an async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

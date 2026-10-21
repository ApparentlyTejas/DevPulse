"""FastAPI app factory + ASGI entrypoint.

Uvicorn runs `app.main:app`. The factory makes the app importable for tests
without triggering side effects at import time.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api import api_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.db.engine import create_engine
from app.db.health import check_database, check_redis
from app.db.redis import create_redis
from app.db.session import build_sessionmaker

logger = get_logger(__name__)


def _build_lifespan(
    settings: Settings,
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    """Build the lifespan context manager bound to a specific `Settings`.

    Bug fix: this used to be a module-level `lifespan` function that called
    `get_settings()` directly, ignoring whatever `Settings` was passed into
    `create_app(settings=...)`. That broke the documented contract ("passing
    settings explicitly is useful in tests") — a caller building the app with
    test settings (e.g. pointed at a testcontainer Postgres/Redis) would still
    have startup silently connect using the globally cached `get_settings()`
    env-derived settings instead. Closing over the actual `settings` passed to
    `create_app` fixes that.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        """Application lifespan: startup before yield, shutdown after.

        Startup:
          - build the async SQLAlchemy engine + sessionmaker
          - build the async Redis client
          - stash both on `app.state` for dependencies to find
        Shutdown:
          - dispose the engine (closes pooled connections cleanly)
          - close the Redis client
        """
        logger.info(
            "app.startup",
            app_env=settings.app_env,
            version=__version__,
            debug=settings.app_debug,
        )

        # --- DB engine + sessionmaker ---
        engine = create_engine(settings)
        sessionmaker = build_sessionmaker(engine)
        app.state.db_engine = engine
        app.state.db_sessionmaker = sessionmaker

        # --- Redis ---
        redis_client = create_redis(settings)
        app.state.redis = redis_client

        try:
            yield
        finally:
            logger.info("app.shutdown")
            await redis_client.aclose()
            await engine.dispose()

    return lifespan


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build a FastAPI application.

    Passing settings explicitly is useful in tests; in production we let it
    pull from the cached `get_settings()`.
    """
    settings = settings or get_settings()

    configure_logging(
        log_level=settings.app_log_level,
        json_logs=settings.app_env != "local",
    )

    app = FastAPI(
        title="DevPulse API",
        version=__version__,
        description="AI-powered engineering operations platform.",
        debug=settings.app_debug,
        lifespan=_build_lifespan(settings),
        docs_url="/docs",
        redoc_url=None,
        openapi_url=f"{settings.api.v1_prefix}/openapi.json",
    )

    _configure_cors(app, settings)
    _register_health_endpoints(app)
    app.include_router(api_router, prefix=settings.api.v1_prefix)

    return app


def _configure_cors(app: FastAPI, settings: Settings) -> None:
    """Strict CORS. Never use '*' with credentials."""
    if not settings.api.cors_origins:
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )


def _register_health_endpoints(app: FastAPI) -> None:
    """Liveness + readiness probes.

    /healthz: process is alive — never depends on external services.
    /readyz:  process is ready to serve traffic. Real DB + Redis probes.
              Returns 503 if any dependency is unreachable so load balancers
              will route traffic away from this instance.
    """

    @app.get("/healthz", tags=["health"], include_in_schema=False)
    async def healthz() -> JSONResponse:
        return JSONResponse({"status": "ok", "version": __version__})

    @app.get("/readyz", tags=["health"], include_in_schema=False)
    async def readyz() -> JSONResponse:
        db_result = await check_database(app.state.db_engine)
        redis_result = await check_redis(app.state.redis)

        overall_ok = db_result["status"] == "ok" and redis_result["status"] == "ok"
        return JSONResponse(
            status_code=status.HTTP_200_OK if overall_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "ready" if overall_ok else "not_ready",
                "checks": {"db": db_result, "redis": redis_result},
                "version": __version__,
            },
        )


# Module-level `app` for `uvicorn app.main:app`.
app: FastAPI = create_app()

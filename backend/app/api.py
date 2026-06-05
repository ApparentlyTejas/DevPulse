"""API router composition root.

As we add domain modules (auth, organizations, services, ...) we mount their
routers here. Keeping this file as the single mount point gives us one place
to find every endpoint and one place to apply version-wide concerns.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.alerts.router import router as alerts_router
from app.modules.auth.router import router as auth_router
from app.modules.incidents.router import router as incidents_router
from app.modules.metrics.router import router as metrics_router
from app.modules.organizations.router import router as orgs_router
from app.modules.services.router import router as services_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(orgs_router, prefix="/organizations", tags=["organizations"])

# Services are nested under an org.
api_router.include_router(
    services_router,
    prefix="/organizations/{org_id}/services",
    tags=["services"],
)

# Metrics and alerts are nested under a service.
api_router.include_router(
    metrics_router,
    prefix="/organizations/{org_id}/services/{service_id}/metrics",
    tags=["metrics"],
)
api_router.include_router(
    alerts_router,
    prefix="/organizations/{org_id}/services/{service_id}/alerts",
    tags=["alerts"],
)

# Incidents are org-level (optionally linked to a service).
api_router.include_router(
    incidents_router,
    prefix="/organizations/{org_id}/incidents",
    tags=["incidents"],
)

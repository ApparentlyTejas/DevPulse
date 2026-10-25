"""Metrics HTTP endpoints: ingest + query metric snapshots for a service."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.core.pagination import Page, Pagination
from app.db.session import DbSession
from app.modules.auth.deps import CurrentUser
from app.modules.metrics import service as metrics_service
from app.modules.metrics.schemas import IngestMetricRequest, MetricSnapshotOut
from app.modules.metrics.service import OrgNotFoundError, ServiceNotFoundError

router = APIRouter()


@router.post(
    "",
    response_model=MetricSnapshotOut,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_metric(
    org_id: UUID,
    service_id: UUID,
    req: IngestMetricRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> MetricSnapshotOut:
    try:
        snapshot = await metrics_service.ingest(
            db,
            org_id=org_id,
            service_id=service_id,
            user_id=current_user.id,
            metric_name=req.metric_name,
            value=req.value,
            unit=req.unit,
            recorded_at=req.recorded_at,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        ) from exc
    return MetricSnapshotOut.model_validate(snapshot)


@router.get("", response_model=Page[MetricSnapshotOut])
async def list_metrics(
    org_id: UUID,
    service_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
    page: Pagination,
    metric_name: str | None = Query(None, max_length=100),
) -> Page[MetricSnapshotOut]:
    try:
        snapshots, total = await metrics_service.query(
            db,
            org_id=org_id,
            service_id=service_id,
            user_id=current_user.id,
            metric_name=metric_name,
            limit=page.limit,
            offset=page.offset,
        )
    except OrgNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        ) from exc
    except ServiceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Service not found"
        ) from exc
    return Page(
        items=[MetricSnapshotOut.model_validate(s) for s in snapshots],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )

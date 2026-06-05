"""Integration tests for the metrics endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

AUTH = "/api/v1/auth"
ORGS = "/api/v1/organizations"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _setup(client: AsyncClient, email: str, org_slug: str, svc_slug: str) -> tuple[str, str, str]:
    """Register user, create org + service. Returns (token, org_id, service_id)."""
    reg = await client.post(AUTH + "/register", json={"email": email, "password": "password99"})
    token = reg.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {token}"}

    org = await client.post(ORGS, json={"name": "Org", "slug": org_slug}, headers=hdrs)
    org_id = org.json()["id"]

    svc = await client.post(
        f"{ORGS}/{org_id}/services",
        json={"name": "Service", "slug": svc_slug},
        headers=hdrs,
    )
    svc_id = svc.json()["id"]
    return token, org_id, svc_id


def _metric_url(org_id: str, svc_id: str) -> str:
    return f"{ORGS}/{org_id}/services/{svc_id}/metrics"


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------


async def test_ingest_metric_returns_201(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(client, "metrics-ingest@example.com", "metrics-org", "metrics-svc")
    hdrs = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        _metric_url(org_id, svc_id),
        json={"metric_name": "response_time_ms", "value": 42.5, "unit": "ms"},
        headers=hdrs,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["metric_name"] == "response_time_ms"
    assert body["value"] == 42.5
    assert body["unit"] == "ms"
    assert body["service_id"] == svc_id


async def test_ingest_metric_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _ = await _setup(client, "metrics-404@example.com", "metrics-404-org", "metrics-404-svc")
    import uuid
    resp = await client.post(
        _metric_url(org_id, str(uuid.uuid4())),
        json={"metric_name": "cpu", "value": 1.0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------


async def test_list_metrics_returns_snapshots(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(client, "metrics-list@example.com", "metrics-list-org", "metrics-list-svc")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _metric_url(org_id, svc_id)

    await client.post(url, json={"metric_name": "uptime", "value": 99.9}, headers=hdrs)
    await client.post(url, json={"metric_name": "uptime", "value": 100.0}, headers=hdrs)
    await client.post(url, json={"metric_name": "error_rate", "value": 0.1}, headers=hdrs)

    resp = await client.get(url, headers=hdrs)
    assert resp.status_code == 200
    assert len(resp.json()) == 3


async def test_list_metrics_filter_by_name(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(client, "metrics-filter@example.com", "metrics-filter-org", "metrics-filter-svc")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _metric_url(org_id, svc_id)

    await client.post(url, json={"metric_name": "cpu", "value": 50.0}, headers=hdrs)
    await client.post(url, json={"metric_name": "memory", "value": 75.0}, headers=hdrs)

    resp = await client.get(url, params={"metric_name": "cpu"}, headers=hdrs)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["metric_name"] == "cpu"


async def test_list_metrics_limit(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(client, "metrics-limit@example.com", "metrics-limit-org", "metrics-limit-svc")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _metric_url(org_id, svc_id)

    for i in range(5):
        await client.post(url, json={"metric_name": "req", "value": float(i)}, headers=hdrs)

    resp = await client.get(url, params={"limit": 3}, headers=hdrs)
    assert resp.status_code == 200
    assert len(resp.json()) == 3

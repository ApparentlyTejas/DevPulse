"""Integration tests for the services endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

AUTH = "/api/v1/auth"
ORGS = "/api/v1/organizations"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str) -> str:
    resp = await client.post(AUTH + "/register", json={"email": email, "password": "password99"})
    return resp.json()["access_token"]  # type: ignore[no-any-return]


async def _create_org(client: AsyncClient, token: str, slug: str) -> dict:  # type: ignore[type-arg]
    resp = await client.post(
        ORGS,
        json={"name": "Test Org", "slug": slug},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    return resp.json()  # type: ignore[no-any-return]


def _svc_url(org_id: str) -> str:
    return f"{ORGS}/{org_id}/services"


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def test_create_service_returns_201(client: AsyncClient) -> None:
    token = await _register(client, "svc-create@example.com")
    org = await _create_org(client, token, "svc-create-org")

    resp = await client.post(
        _svc_url(org["id"]),
        json={"name": "API Gateway", "slug": "api-gateway"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "api-gateway"
    assert body["status"] == "unknown"
    assert body["org_id"] == org["id"]


async def test_create_service_duplicate_slug_returns_409(client: AsyncClient) -> None:
    token = await _register(client, "svc-dup@example.com")
    org = await _create_org(client, token, "svc-dup-org")

    payload = {"name": "My Service", "slug": "my-service"}
    await client.post(_svc_url(org["id"]), json=payload, headers={"Authorization": f"Bearer {token}"})
    resp = await client.post(_svc_url(org["id"]), json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 409


async def test_create_service_wrong_org_returns_404(client: AsyncClient) -> None:
    token = await _register(client, "svc-wrongorg@example.com")
    import uuid
    resp = await client.post(
        _svc_url(str(uuid.uuid4())),
        json={"name": "Ghost", "slug": "ghost"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# List + Get
# ---------------------------------------------------------------------------


async def test_list_services(client: AsyncClient) -> None:
    token = await _register(client, "svc-list@example.com")
    org = await _create_org(client, token, "svc-list-org")
    hdrs = {"Authorization": f"Bearer {token}"}

    await client.post(_svc_url(org["id"]), json={"name": "A", "slug": "svc-a"}, headers=hdrs)
    await client.post(_svc_url(org["id"]), json={"name": "B", "slug": "svc-b"}, headers=hdrs)

    resp = await client.get(_svc_url(org["id"]), headers=hdrs)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_get_service_not_found_returns_404(client: AsyncClient) -> None:
    token = await _register(client, "svc-get404@example.com")
    org = await _create_org(client, token, "svc-get404-org")
    import uuid
    resp = await client.get(
        f"{_svc_url(org['id'])}/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


async def test_update_service_status(client: AsyncClient) -> None:
    token = await _register(client, "svc-update@example.com")
    org = await _create_org(client, token, "svc-update-org")
    hdrs = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        _svc_url(org["id"]), json={"name": "Worker", "slug": "worker"}, headers=hdrs
    )
    svc_id = create.json()["id"]

    resp = await client.patch(
        f"{_svc_url(org['id'])}/{svc_id}",
        json={"status": "healthy"},
        headers=hdrs,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_service(client: AsyncClient) -> None:
    token = await _register(client, "svc-delete@example.com")
    org = await _create_org(client, token, "svc-delete-org")
    hdrs = {"Authorization": f"Bearer {token}"}

    create = await client.post(
        _svc_url(org["id"]), json={"name": "Temp", "slug": "temp-svc"}, headers=hdrs
    )
    svc_id = create.json()["id"]

    resp = await client.delete(f"{_svc_url(org['id'])}/{svc_id}", headers=hdrs)
    assert resp.status_code == 204

    resp = await client.get(f"{_svc_url(org['id'])}/{svc_id}", headers=hdrs)
    assert resp.status_code == 404

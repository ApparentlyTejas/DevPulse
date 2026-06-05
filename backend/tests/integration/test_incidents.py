"""Integration tests for the incidents endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

AUTH = "/api/v1/auth"
ORGS = "/api/v1/organizations"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _setup(client: AsyncClient, email: str, org_slug: str) -> tuple[str, str]:
    """Register user + create org. Returns (token, org_id)."""
    reg = await client.post(AUTH + "/register", json={"email": email, "password": "password99"})
    token = reg.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {token}"}

    org = await client.post(ORGS, json={"name": "Org", "slug": org_slug}, headers=hdrs)
    org_id = org.json()["id"]
    return token, org_id


def _inc_url(org_id: str) -> str:
    return f"{ORGS}/{org_id}/incidents"


_INC_PAYLOAD = {"title": "Database is slow", "severity": "sev2"}


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def test_create_incident_returns_201(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-create@example.com", "inc-create-org")

    resp = await client.post(
        _inc_url(org_id),
        json=_INC_PAYLOAD,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Database is slow"
    assert body["severity"] == "sev2"
    assert body["incident_status"] == "open"
    assert body["resolved_at"] is None
    assert body["service_id"] is None


async def test_create_incident_linked_to_service(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-svc@example.com", "inc-svc-org")
    hdrs = {"Authorization": f"Bearer {token}"}

    svc = await client.post(
        f"{ORGS}/{org_id}/services",
        json={"name": "DB", "slug": "db"},
        headers=hdrs,
    )
    svc_id = svc.json()["id"]

    resp = await client.post(
        _inc_url(org_id),
        json={**_INC_PAYLOAD, "service_id": svc_id},
        headers=hdrs,
    )
    assert resp.status_code == 201
    assert resp.json()["service_id"] == svc_id


async def test_create_incident_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-badsvc@example.com", "inc-badsvc-org")
    import uuid
    resp = await client.post(
        _inc_url(org_id),
        json={**_INC_PAYLOAD, "service_id": str(uuid.uuid4())},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# List + Get
# ---------------------------------------------------------------------------


async def test_list_incidents(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-list@example.com", "inc-list-org")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _inc_url(org_id)

    await client.post(url, json={"title": "Incident A", "severity": "sev1"}, headers=hdrs)
    await client.post(url, json={"title": "Incident B", "severity": "sev3"}, headers=hdrs)

    resp = await client.get(url, headers=hdrs)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_get_incident_not_found_returns_404(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-get404@example.com", "inc-get404-org")
    import uuid
    resp = await client.get(
        f"{_inc_url(org_id)}/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


async def test_update_incident_fields(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-update@example.com", "inc-update-org")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _inc_url(org_id)

    inc_id = (await client.post(url, json=_INC_PAYLOAD, headers=hdrs)).json()["id"]

    resp = await client.patch(
        f"{url}/{inc_id}",
        json={"title": "Updated title", "severity": "sev1"},
        headers=hdrs,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Updated title"
    assert body["severity"] == "sev1"


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------


async def test_incident_status_lifecycle(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-lifecycle@example.com", "inc-lifecycle-org")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _inc_url(org_id)

    inc_id = (await client.post(url, json=_INC_PAYLOAD, headers=hdrs)).json()["id"]

    for new_status in ("investigating", "identified", "monitoring", "resolved"):
        resp = await client.patch(
            f"{url}/{inc_id}/status",
            json={"incident_status": new_status},
            headers=hdrs,
        )
        assert resp.status_code == 200, f"Transition to {new_status} failed: {resp.json()}"
        assert resp.json()["incident_status"] == new_status

    assert resp.json()["resolved_at"] is not None


async def test_invalid_status_transition_returns_422(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-badtrans@example.com", "inc-badtrans-org")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _inc_url(org_id)

    inc_id = (await client.post(url, json=_INC_PAYLOAD, headers=hdrs)).json()["id"]

    # Resolve it.
    await client.patch(f"{url}/{inc_id}/status", json={"incident_status": "resolved"}, headers=hdrs)
    # Cannot re-open a resolved incident.
    resp = await client.patch(
        f"{url}/{inc_id}/status",
        json={"incident_status": "investigating"},
        headers=hdrs,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_incident(client: AsyncClient) -> None:
    token, org_id = await _setup(client, "inc-delete@example.com", "inc-delete-org")
    hdrs = {"Authorization": f"Bearer {token}"}
    url = _inc_url(org_id)

    inc_id = (await client.post(url, json=_INC_PAYLOAD, headers=hdrs)).json()["id"]

    resp = await client.delete(f"{url}/{inc_id}", headers=hdrs)
    assert resp.status_code == 204

    resp = await client.get(f"{url}/{inc_id}", headers=hdrs)
    assert resp.status_code == 404

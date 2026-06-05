"""Integration tests for the alerts endpoints (rules + events)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

AUTH = "/api/v1/auth"
ORGS = "/api/v1/organizations"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _setup(
    client: AsyncClient, email: str, org_slug: str, svc_slug: str
) -> tuple[str, str, str]:
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


def _alerts_url(org_id: str, svc_id: str) -> str:
    return f"{ORGS}/{org_id}/services/{svc_id}/alerts"


_RULE_PAYLOAD = {
    "name": "High latency",
    "metric_name": "response_time_ms",
    "condition_operator": "gt",
    "threshold": 500.0,
    "window_seconds": 60,
    "severity": "warning",
}

_EVENT_PAYLOAD = {
    "title": "Latency spike detected",
    "severity": "warning",
}


# ---------------------------------------------------------------------------
# Alert rules — CRUD
# ---------------------------------------------------------------------------


async def test_create_alert_rule_returns_201(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-rule-create@example.com", "alerts-rule-org", "alerts-rule-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        _alerts_url(org_id, svc_id) + "/rules",
        json=_RULE_PAYLOAD,
        headers=hdrs,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["metric_name"] == "response_time_ms"
    assert body["threshold"] == 500.0
    assert body["is_enabled"] is True


async def test_list_alert_rules(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-rule-list@example.com", "alerts-rule-list-org", "alerts-rule-list-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    base = _alerts_url(org_id, svc_id) + "/rules"

    await client.post(base, json=_RULE_PAYLOAD, headers=hdrs)
    await client.post(
        base, json={**_RULE_PAYLOAD, "name": "Low uptime", "metric_name": "uptime"}, headers=hdrs
    )

    resp = await client.get(base, headers=hdrs)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_update_alert_rule(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-rule-update@example.com", "alerts-rule-update-org", "alerts-rule-update-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    base = _alerts_url(org_id, svc_id) + "/rules"

    rule_id = (await client.post(base, json=_RULE_PAYLOAD, headers=hdrs)).json()["id"]

    resp = await client.patch(
        f"{base}/{rule_id}",
        json={"threshold": 1000.0, "severity": "critical"},
        headers=hdrs,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["threshold"] == 1000.0
    assert body["severity"] == "critical"


async def test_delete_alert_rule(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-rule-delete@example.com", "alerts-rule-delete-org", "alerts-rule-delete-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    base = _alerts_url(org_id, svc_id) + "/rules"

    rule_id = (await client.post(base, json=_RULE_PAYLOAD, headers=hdrs)).json()["id"]

    resp = await client.delete(f"{base}/{rule_id}", headers=hdrs)
    assert resp.status_code == 204

    resp = await client.get(f"{base}/{rule_id}", headers=hdrs)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Alert events — lifecycle
# ---------------------------------------------------------------------------


async def test_create_alert_event_returns_201(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-event-create@example.com", "alerts-event-org", "alerts-event-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        _alerts_url(org_id, svc_id) + "/events",
        json=_EVENT_PAYLOAD,
        headers=hdrs,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["alert_status"] == "open"
    assert body["acknowledged_at"] is None
    assert body["resolved_at"] is None


async def test_acknowledge_alert_event(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-ack@example.com", "alerts-ack-org", "alerts-ack-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    events_url = _alerts_url(org_id, svc_id) + "/events"

    event_id = (await client.post(events_url, json=_EVENT_PAYLOAD, headers=hdrs)).json()["id"]

    resp = await client.patch(
        f"{events_url}/{event_id}/status",
        json={"alert_status": "acknowledged"},
        headers=hdrs,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["alert_status"] == "acknowledged"
    assert body["acknowledged_at"] is not None


async def test_resolve_alert_event(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-resolve@example.com", "alerts-resolve-org", "alerts-resolve-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    events_url = _alerts_url(org_id, svc_id) + "/events"

    event_id = (await client.post(events_url, json=_EVENT_PAYLOAD, headers=hdrs)).json()["id"]
    await client.patch(
        f"{events_url}/{event_id}/status", json={"alert_status": "acknowledged"}, headers=hdrs
    )

    resp = await client.patch(
        f"{events_url}/{event_id}/status",
        json={"alert_status": "resolved"},
        headers=hdrs,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["alert_status"] == "resolved"
    assert body["resolved_at"] is not None


async def test_invalid_status_transition_returns_422(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-badtrans@example.com", "alerts-badtrans-org", "alerts-badtrans-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    events_url = _alerts_url(org_id, svc_id) + "/events"

    event_id = (await client.post(events_url, json=_EVENT_PAYLOAD, headers=hdrs)).json()["id"]

    # Cannot go directly from open → resolved without acknowledging (wait, actually that IS valid)
    # Let's resolve it first and then try to re-open it (which is invalid).
    await client.patch(
        f"{events_url}/{event_id}/status", json={"alert_status": "resolved"}, headers=hdrs
    )
    resp = await client.patch(
        f"{events_url}/{event_id}/status",
        json={"alert_status": "acknowledged"},
        headers=hdrs,
    )
    assert resp.status_code == 422

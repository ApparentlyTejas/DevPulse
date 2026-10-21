"""Integration tests for the alerts error paths.

`tests/integration/test_alerts.py` covers the happy paths (CRUD + status
lifecycle). None of the 404 branches in `app/modules/alerts/router.py` (org
not found, service not found, rule/event not found) nor the corresponding
`_assert_service_in_org` checks in `app/modules/alerts/service.py` were
exercised anywhere, which is most of why those two files sat at ~41-44%
coverage. This file fills in exactly those branches.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

AUTH = "/api/v1/auth"
ORGS = "/api/v1/organizations"

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


# ---------------------------------------------------------------------------
# Org not found (user is not a member of org_id at all)
# ---------------------------------------------------------------------------


async def test_create_rule_unknown_org_returns_404(client: AsyncClient) -> None:
    token, _org_id, svc_id = await _setup(
        client, "alerts-err-org1@example.com", "alerts-err-org1", "alerts-err-org1-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.post(
        _alerts_url(str(uuid.uuid4()), svc_id) + "/rules", json=_RULE_PAYLOAD, headers=hdrs
    )
    assert resp.status_code == 404


async def test_list_rules_unknown_org_returns_404(client: AsyncClient) -> None:
    token, _org_id, svc_id = await _setup(
        client, "alerts-err-org2@example.com", "alerts-err-org2", "alerts-err-org2-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.get(_alerts_url(str(uuid.uuid4()), svc_id) + "/rules", headers=hdrs)
    assert resp.status_code == 404


async def test_create_event_unknown_org_returns_404(client: AsyncClient) -> None:
    token, _org_id, svc_id = await _setup(
        client, "alerts-err-org3@example.com", "alerts-err-org3", "alerts-err-org3-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.post(
        _alerts_url(str(uuid.uuid4()), svc_id) + "/events", json=_EVENT_PAYLOAD, headers=hdrs
    )
    assert resp.status_code == 404


async def test_list_events_unknown_org_returns_404(client: AsyncClient) -> None:
    token, _org_id, svc_id = await _setup(
        client, "alerts-err-org4@example.com", "alerts-err-org4", "alerts-err-org4-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.get(_alerts_url(str(uuid.uuid4()), svc_id) + "/events", headers=hdrs)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Service not found (org is real, but service_id doesn't belong to it)
# ---------------------------------------------------------------------------


async def test_create_rule_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _svc_id = await _setup(
        client, "alerts-err-svc1@example.com", "alerts-err-svc1", "alerts-err-svc1-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.post(
        _alerts_url(org_id, str(uuid.uuid4())) + "/rules", json=_RULE_PAYLOAD, headers=hdrs
    )
    assert resp.status_code == 404


async def test_get_rule_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _svc_id = await _setup(
        client, "alerts-err-svc2@example.com", "alerts-err-svc2", "alerts-err-svc2-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.get(
        _alerts_url(org_id, str(uuid.uuid4())) + f"/rules/{uuid.uuid4()}", headers=hdrs
    )
    assert resp.status_code == 404


async def test_update_rule_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _svc_id = await _setup(
        client, "alerts-err-svc3@example.com", "alerts-err-svc3", "alerts-err-svc3-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.patch(
        _alerts_url(org_id, str(uuid.uuid4())) + f"/rules/{uuid.uuid4()}",
        json={"threshold": 10.0},
        headers=hdrs,
    )
    assert resp.status_code == 404


async def test_delete_rule_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _svc_id = await _setup(
        client, "alerts-err-svc4@example.com", "alerts-err-svc4", "alerts-err-svc4-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.delete(
        _alerts_url(org_id, str(uuid.uuid4())) + f"/rules/{uuid.uuid4()}", headers=hdrs
    )
    assert resp.status_code == 404


async def test_create_event_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _svc_id = await _setup(
        client, "alerts-err-svc5@example.com", "alerts-err-svc5", "alerts-err-svc5-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.post(
        _alerts_url(org_id, str(uuid.uuid4())) + "/events", json=_EVENT_PAYLOAD, headers=hdrs
    )
    assert resp.status_code == 404


async def test_get_event_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _svc_id = await _setup(
        client, "alerts-err-svc6@example.com", "alerts-err-svc6", "alerts-err-svc6-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.get(
        _alerts_url(org_id, str(uuid.uuid4())) + f"/events/{uuid.uuid4()}", headers=hdrs
    )
    assert resp.status_code == 404


async def test_update_event_status_unknown_service_returns_404(client: AsyncClient) -> None:
    token, org_id, _svc_id = await _setup(
        client, "alerts-err-svc7@example.com", "alerts-err-svc7", "alerts-err-svc7-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.patch(
        _alerts_url(org_id, str(uuid.uuid4())) + f"/events/{uuid.uuid4()}/status",
        json={"alert_status": "acknowledged"},
        headers=hdrs,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Rule / event not found (org + service are real, id is bogus)
# ---------------------------------------------------------------------------


async def test_get_rule_unknown_rule_returns_404(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-err-rule1@example.com", "alerts-err-rule1", "alerts-err-rule1-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.get(_alerts_url(org_id, svc_id) + f"/rules/{uuid.uuid4()}", headers=hdrs)
    assert resp.status_code == 404


async def test_update_rule_unknown_rule_returns_404(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-err-rule2@example.com", "alerts-err-rule2", "alerts-err-rule2-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.patch(
        _alerts_url(org_id, svc_id) + f"/rules/{uuid.uuid4()}",
        json={"threshold": 10.0},
        headers=hdrs,
    )
    assert resp.status_code == 404


async def test_delete_rule_unknown_rule_returns_404(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-err-rule3@example.com", "alerts-err-rule3", "alerts-err-rule3-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.delete(_alerts_url(org_id, svc_id) + f"/rules/{uuid.uuid4()}", headers=hdrs)
    assert resp.status_code == 404


async def test_get_event_unknown_event_returns_404(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-err-event1@example.com", "alerts-err-event1", "alerts-err-event1-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.get(_alerts_url(org_id, svc_id) + f"/events/{uuid.uuid4()}", headers=hdrs)
    assert resp.status_code == 404


async def test_update_event_status_unknown_event_returns_404(client: AsyncClient) -> None:
    token, org_id, svc_id = await _setup(
        client, "alerts-err-event2@example.com", "alerts-err-event2", "alerts-err-event2-svc"
    )
    hdrs = {"Authorization": f"Bearer {token}"}
    resp = await client.patch(
        _alerts_url(org_id, svc_id) + f"/events/{uuid.uuid4()}/status",
        json={"alert_status": "acknowledged"},
        headers=hdrs,
    )
    assert resp.status_code == 404

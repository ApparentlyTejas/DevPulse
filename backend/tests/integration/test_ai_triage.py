"""Integration tests for AI incident triage.

The Anthropic API call itself is monkeypatched (`ai.service.get_claude_client`)
rather than hitting the real API: CI has no API key, and these tests are
about our request/response handling and persistence, not Claude's model
behavior.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.modules.ai import service as ai_service

pytestmark = pytest.mark.integration

AUTH = "/api/v1/auth"
ORGS = "/api/v1/organizations"

_INC_PAYLOAD = {"title": "Database is slow", "severity": "sev2"}


class _FakeBlock:
    def __init__(self, input_: dict[str, Any]) -> None:
        self.type = "tool_use"
        self.name = "submit_triage"
        self.input = input_


class _FakeMessage:
    def __init__(self, content: list[Any]) -> None:
        self.content = content


class _FakeMessages:
    def __init__(self, response: _FakeMessage | Exception) -> None:
        self._response = response

    async def create(self, **_kwargs: object) -> _FakeMessage:
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class _FakeClient:
    def __init__(self, response: _FakeMessage | Exception) -> None:
        self.messages = _FakeMessages(response)


def _patch_claude(monkeypatch: pytest.MonkeyPatch, response: _FakeMessage | Exception) -> None:
    monkeypatch.setattr(ai_service, "get_claude_client", lambda _settings: _FakeClient(response))


async def _setup(client: AsyncClient, email: str, org_slug: str) -> tuple[str, str, str]:
    """Register user + create org + create an incident. Returns (token, org_id, incident_id)."""
    reg = await client.post(AUTH + "/register", json={"email": email, "password": "password99"})
    token = reg.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {token}"}

    org = await client.post(ORGS, json={"name": "Org", "slug": org_slug}, headers=hdrs)
    org_id = org.json()["id"]

    inc = await client.post(f"{ORGS}/{org_id}/incidents", json=_INC_PAYLOAD, headers=hdrs)
    incident_id = inc.json()["id"]

    return token, org_id, incident_id


def _triage_url(org_id: str, incident_id: str) -> str:
    return f"{ORGS}/{org_id}/incidents/{incident_id}/triage"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_triage_returns_201_and_persists(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_claude(
        monkeypatch,
        _FakeMessage(
            [
                _FakeBlock(
                    {
                        "summary": "Likely a slow query on the orders table.",
                        "suggested_severity": "sev1",
                        "confidence": 0.82,
                    }
                )
            ]
        ),
    )
    token, org_id, incident_id = await _setup(client, "triage-happy@example.com", "triage-org")

    resp = await client.post(
        _triage_url(org_id, incident_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["incident_id"] == incident_id
    assert body["summary"] == "Likely a slow query on the orders table."
    assert body["suggested_severity"] == "sev1"
    assert body["confidence"] == pytest.approx(0.82)
    assert UUID(body["id"])

    # Persisted: listing returns it back.
    listed = await client.get(
        _triage_url(org_id, incident_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == body["id"]


async def test_triage_history_orders_newest_first(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_claude(
        monkeypatch,
        _FakeMessage(
            [_FakeBlock({"summary": "first pass", "suggested_severity": "sev3", "confidence": 0.5})]
        ),
    )
    token, org_id, incident_id = await _setup(client, "triage-history@example.com", "triage-hist")
    hdrs = {"Authorization": f"Bearer {token}"}

    first = await client.post(_triage_url(org_id, incident_id), headers=hdrs)

    _patch_claude(
        monkeypatch,
        _FakeMessage(
            [
                _FakeBlock(
                    {"summary": "second pass", "suggested_severity": "sev2", "confidence": 0.9}
                )
            ]
        ),
    )
    second = await client.post(_triage_url(org_id, incident_id), headers=hdrs)

    listed = await client.get(_triage_url(org_id, incident_id), headers=hdrs)
    results = listed.json()
    assert len(results) == 2
    assert results[0]["id"] == second.json()["id"]
    assert results[1]["id"] == first.json()["id"]


async def test_triage_clamps_out_of_range_confidence(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_claude(
        monkeypatch,
        _FakeMessage(
            [
                _FakeBlock(
                    {"summary": "overconfident", "suggested_severity": "sev1", "confidence": 1.4}
                )
            ]
        ),
    )
    token, org_id, incident_id = await _setup(client, "triage-clamp@example.com", "triage-clamp")

    resp = await client.post(
        _triage_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    assert resp.json()["confidence"] == 1.0


async def test_triage_unknown_severity_from_model_stored_as_none(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_claude(
        monkeypatch,
        _FakeMessage(
            [
                _FakeBlock(
                    {
                        "summary": "unparseable",
                        "suggested_severity": "catastrophic",
                        "confidence": 0.5,
                    }
                )
            ]
        ),
    )
    token, org_id, incident_id = await _setup(client, "triage-badsev@example.com", "triage-badsev")

    resp = await client.post(
        _triage_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201
    assert resp.json()["suggested_severity"] is None


async def test_triage_on_incident_linked_to_service_includes_service_in_prompt(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Covers the `service is not None` branch of `_build_prompt`."""
    captured: dict[str, Any] = {}

    class _CapturingMessages(_FakeMessages):
        async def create(self, **kwargs: object) -> _FakeMessage:
            captured.update(kwargs)
            return await super().create(**kwargs)

    class _CapturingClient(_FakeClient):
        def __init__(self, response: _FakeMessage) -> None:
            super().__init__(response)
            self.messages = _CapturingMessages(response)

    response = _FakeMessage(
        [_FakeBlock({"summary": "svc-aware", "suggested_severity": "sev2", "confidence": 0.7})]
    )
    monkeypatch.setattr(
        ai_service, "get_claude_client", lambda _settings: _CapturingClient(response)
    )

    token, org_id, _ = await _setup(client, "triage-svc@example.com", "triage-svc")
    hdrs = {"Authorization": f"Bearer {token}"}

    svc = await client.post(
        f"{ORGS}/{org_id}/services", json={"name": "Checkout", "slug": "checkout"}, headers=hdrs
    )
    svc_id = svc.json()["id"]
    inc = await client.post(
        f"{ORGS}/{org_id}/incidents",
        json={**_INC_PAYLOAD, "service_id": svc_id, "description": "Timeouts on checkout"},
        headers=hdrs,
    )
    incident_id = inc.json()["id"]

    resp = await client.post(_triage_url(org_id, incident_id), headers=hdrs)
    assert resp.status_code == 201

    prompt = captured["messages"][0]["content"]
    assert "Affected service: Checkout" in prompt
    assert "Timeouts on checkout" in prompt


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


async def test_triage_unknown_org_returns_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import uuid

    _patch_claude(
        monkeypatch,
        _FakeMessage(
            [_FakeBlock({"summary": "x", "suggested_severity": "sev1", "confidence": 0.1})]
        ),
    )
    reg = await client.post(
        AUTH + "/register", json={"email": "triage-noorg@example.com", "password": "password99"}
    )
    token = reg.json()["access_token"]

    resp = await client.post(
        _triage_url(str(uuid.uuid4()), str(uuid.uuid4())),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_triage_unknown_incident_returns_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import uuid

    _patch_claude(
        monkeypatch,
        _FakeMessage(
            [_FakeBlock({"summary": "x", "suggested_severity": "sev1", "confidence": 0.1})]
        ),
    )
    reg = await client.post(
        AUTH + "/register", json={"email": "triage-noinc@example.com", "password": "password99"}
    )
    token = reg.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {token}"}
    org = await client.post(ORGS, json={"name": "Org", "slug": "triage-noinc"}, headers=hdrs)
    org_id = org.json()["id"]

    resp = await client.post(_triage_url(org_id, str(uuid.uuid4())), headers=hdrs)
    assert resp.status_code == 404


async def test_triage_claude_api_error_returns_502(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx
    from anthropic import APIConnectionError

    _patch_claude(monkeypatch, APIConnectionError(request=httpx.Request("POST", "http://test")))
    token, org_id, incident_id = await _setup(client, "triage-apierr@example.com", "triage-apierr")

    resp = await client.post(
        _triage_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 502


async def test_triage_missing_tool_call_raises_ai_triage_error(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Covers the branch where Claude responds without the forced tool call."""
    _patch_claude(monkeypatch, _FakeMessage([]))
    token, org_id, incident_id = await _setup(client, "triage-notool@example.com", "triage-notool")

    resp = await client.post(
        _triage_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 502
    assert "submit_triage" in resp.json()["detail"]


async def test_list_triages_unknown_org_returns_404(client: AsyncClient) -> None:
    import uuid

    reg = await client.post(
        AUTH + "/register",
        json={"email": "triage-list-noorg@example.com", "password": "password99"},
    )
    token = reg.json()["access_token"]

    resp = await client.get(
        _triage_url(str(uuid.uuid4()), str(uuid.uuid4())),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_list_triages_unknown_incident_returns_404(client: AsyncClient) -> None:
    import uuid

    reg = await client.post(
        AUTH + "/register",
        json={"email": "triage-list-noinc@example.com", "password": "password99"},
    )
    token = reg.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {token}"}
    org = await client.post(ORGS, json={"name": "Org", "slug": "triage-list-noinc"}, headers=hdrs)
    org_id = org.json()["id"]

    resp = await client.get(_triage_url(org_id, str(uuid.uuid4())), headers=hdrs)
    assert resp.status_code == 404


async def test_list_triages_empty_for_untriaged_incident(client: AsyncClient) -> None:
    token, org_id, incident_id = await _setup(client, "triage-empty@example.com", "triage-empty")

    resp = await client.get(
        _triage_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == []

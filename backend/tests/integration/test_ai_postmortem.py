"""Integration tests for AI postmortem generation.

Same monkeypatch-the-Claude-client approach as test_ai_triage.py, but the
fake response carries a plain text block rather than a tool_use block,
since postmortem generation asks for free-form markdown, not structured
JSON via a forced tool call.
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


class _FakeTextBlock:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


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


def _postmortem_url(org_id: str, incident_id: str) -> str:
    return f"{ORGS}/{org_id}/incidents/{incident_id}/postmortem"


def _triage_url(org_id: str, incident_id: str) -> str:
    return f"{ORGS}/{org_id}/incidents/{incident_id}/triage"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


async def test_postmortem_returns_201_and_persists(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_claude(
        monkeypatch,
        _FakeMessage([_FakeTextBlock("## Summary\nDatabase was slow.\n")]),
    )
    token, org_id, incident_id = await _setup(client, "pm-happy@example.com", "pm-happy")

    resp = await client.post(
        _postmortem_url(org_id, incident_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["incident_id"] == incident_id
    assert body["content"] == "## Summary\nDatabase was slow."
    assert UUID(body["id"])

    listed = await client.get(
        _postmortem_url(org_id, incident_id),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == body["id"]


async def test_postmortem_history_orders_newest_first(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_claude(monkeypatch, _FakeMessage([_FakeTextBlock("first draft")]))
    token, org_id, incident_id = await _setup(client, "pm-history@example.com", "pm-history")
    hdrs = {"Authorization": f"Bearer {token}"}

    first = await client.post(_postmortem_url(org_id, incident_id), headers=hdrs)

    _patch_claude(monkeypatch, _FakeMessage([_FakeTextBlock("second draft")]))
    second = await client.post(_postmortem_url(org_id, incident_id), headers=hdrs)

    listed = await client.get(_postmortem_url(org_id, incident_id), headers=hdrs)
    results = listed.json()
    assert len(results) == 2
    assert results[0]["id"] == second.json()["id"]
    assert results[1]["id"] == first.json()["id"]


async def test_postmortem_prompt_includes_triage_history_and_resolution_state(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Covers that triage runs and the open/resolved state are both folded
    into the prompt, in chronological order for triages."""
    captured: dict[str, Any] = {}

    class _CapturingMessages(_FakeMessages):
        async def create(self, **kwargs: object) -> _FakeMessage:
            captured.update(kwargs)
            return await super().create(**kwargs)

    class _CapturingClient(_FakeClient):
        def __init__(self, response: _FakeMessage) -> None:
            super().__init__(response)
            self.messages = _CapturingMessages(response)

    def patch_capturing(response: _FakeMessage) -> None:
        monkeypatch.setattr(
            ai_service, "get_claude_client", lambda _settings: _CapturingClient(response)
        )

    token, org_id, incident_id = await _setup(client, "pm-prompt@example.com", "pm-prompt")
    hdrs = {"Authorization": f"Bearer {token}"}

    # tool_use-shaped response for the triage call
    class _ToolBlock:
        def __init__(self, input_: dict[str, Any]) -> None:
            self.type = "tool_use"
            self.name = "submit_triage"
            self.input = input_

    patch_capturing(
        _FakeMessage(
            [
                _ToolBlock(
                    {
                        "summary": "slow query spotted",
                        "suggested_severity": "sev2",
                        "confidence": 0.6,
                    }
                )
            ]
        )
    )
    await client.post(_triage_url(org_id, incident_id), headers=hdrs)

    patch_capturing(_FakeMessage([_FakeTextBlock("## Summary\n...")]))
    resp = await client.post(_postmortem_url(org_id, incident_id), headers=hdrs)
    assert resp.status_code == 201

    prompt = captured["messages"][0]["content"]
    assert "slow query spotted" in prompt
    assert "Resolved: not yet resolved as of this writing" in prompt
    assert "do not invent" in prompt


async def test_postmortem_prompt_includes_service_description_and_resolved_time(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Covers the resolved/service/description branches of the prompt builder."""
    captured: dict[str, Any] = {}

    class _CapturingMessages(_FakeMessages):
        async def create(self, **kwargs: object) -> _FakeMessage:
            captured.update(kwargs)
            return await super().create(**kwargs)

    class _CapturingClient(_FakeClient):
        def __init__(self, response: _FakeMessage) -> None:
            super().__init__(response)
            self.messages = _CapturingMessages(response)

    response = _FakeMessage([_FakeTextBlock("## Summary\n...")])
    monkeypatch.setattr(
        ai_service, "get_claude_client", lambda _settings: _CapturingClient(response)
    )

    token, org_id, _ = await _setup(client, "pm-resolved@example.com", "pm-resolved")
    hdrs = {"Authorization": f"Bearer {token}"}

    svc = await client.post(
        f"{ORGS}/{org_id}/services", json={"name": "Checkout", "slug": "checkout"}, headers=hdrs
    )
    svc_id = svc.json()["id"]
    inc = await client.post(
        f"{ORGS}/{org_id}/incidents",
        json={
            **_INC_PAYLOAD,
            "service_id": svc_id,
            "description": "Timeouts on checkout",
        },
        headers=hdrs,
    )
    incident_id = inc.json()["id"]
    await client.patch(
        f"{ORGS}/{org_id}/incidents/{incident_id}/status",
        json={"incident_status": "resolved"},
        headers=hdrs,
    )

    resp = await client.post(_postmortem_url(org_id, incident_id), headers=hdrs)
    assert resp.status_code == 201

    prompt = captured["messages"][0]["content"]
    assert "- Affected service: Checkout" in prompt
    assert "- Description: Timeouts on checkout" in prompt
    assert "- Resolved:" in prompt
    assert "not yet resolved" not in prompt


async def test_postmortem_on_incident_without_triages_notes_no_triage_runs(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    class _CapturingMessages(_FakeMessages):
        async def create(self, **kwargs: object) -> _FakeMessage:
            captured.update(kwargs)
            return await super().create(**kwargs)

    class _CapturingClient(_FakeClient):
        def __init__(self, response: _FakeMessage) -> None:
            super().__init__(response)
            self.messages = _CapturingMessages(response)

    response = _FakeMessage([_FakeTextBlock("## Summary\n...")])
    monkeypatch.setattr(
        ai_service, "get_claude_client", lambda _settings: _CapturingClient(response)
    )

    token, org_id, incident_id = await _setup(client, "pm-notriage@example.com", "pm-notriage")
    resp = await client.post(
        _postmortem_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201

    prompt = captured["messages"][0]["content"]
    assert "No triage runs were recorded for this incident." in prompt


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------


async def test_postmortem_unknown_org_returns_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import uuid

    _patch_claude(monkeypatch, _FakeMessage([_FakeTextBlock("x")]))
    reg = await client.post(
        AUTH + "/register", json={"email": "pm-noorg@example.com", "password": "password99"}
    )
    token = reg.json()["access_token"]

    resp = await client.post(
        _postmortem_url(str(uuid.uuid4()), str(uuid.uuid4())),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_postmortem_unknown_incident_returns_404(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import uuid

    _patch_claude(monkeypatch, _FakeMessage([_FakeTextBlock("x")]))
    reg = await client.post(
        AUTH + "/register", json={"email": "pm-noinc@example.com", "password": "password99"}
    )
    token = reg.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {token}"}
    org = await client.post(ORGS, json={"name": "Org", "slug": "pm-noinc"}, headers=hdrs)
    org_id = org.json()["id"]

    resp = await client.post(_postmortem_url(org_id, str(uuid.uuid4())), headers=hdrs)
    assert resp.status_code == 404


async def test_postmortem_claude_api_error_returns_502(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx
    from anthropic import APIConnectionError

    _patch_claude(monkeypatch, APIConnectionError(request=httpx.Request("POST", "http://test")))
    token, org_id, incident_id = await _setup(client, "pm-apierr@example.com", "pm-apierr")

    resp = await client.post(
        _postmortem_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 502


async def test_postmortem_no_text_content_returns_502(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Covers the branch where Claude's response carries no text block at all."""
    _patch_claude(monkeypatch, _FakeMessage([]))
    token, org_id, incident_id = await _setup(client, "pm-notext@example.com", "pm-notext")

    resp = await client.post(
        _postmortem_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 502
    assert "text content" in resp.json()["detail"]


async def test_list_postmortems_unknown_org_returns_404(client: AsyncClient) -> None:
    import uuid

    reg = await client.post(
        AUTH + "/register",
        json={"email": "pm-list-noorg@example.com", "password": "password99"},
    )
    token = reg.json()["access_token"]

    resp = await client.get(
        _postmortem_url(str(uuid.uuid4()), str(uuid.uuid4())),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


async def test_list_postmortems_unknown_incident_returns_404(client: AsyncClient) -> None:
    import uuid

    reg = await client.post(
        AUTH + "/register",
        json={"email": "pm-list-noinc@example.com", "password": "password99"},
    )
    token = reg.json()["access_token"]
    hdrs = {"Authorization": f"Bearer {token}"}
    org = await client.post(ORGS, json={"name": "Org", "slug": "pm-list-noinc"}, headers=hdrs)
    org_id = org.json()["id"]

    resp = await client.get(_postmortem_url(org_id, str(uuid.uuid4())), headers=hdrs)
    assert resp.status_code == 404


async def test_list_postmortems_empty_for_ungenerated_incident(client: AsyncClient) -> None:
    token, org_id, incident_id = await _setup(client, "pm-empty@example.com", "pm-empty")

    resp = await client.get(
        _postmortem_url(org_id, incident_id), headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == []

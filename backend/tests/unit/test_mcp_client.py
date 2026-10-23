"""Unit tests for the MCP server's DevPulse API client.

Uses httpx.MockTransport so these exercise real request construction
(method, path, auth header, JSON body) and response parsing, without a
live DevPulse API or network access.
"""

from __future__ import annotations

from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr

from mcp_server.client import DevPulseAPIError, DevPulseClient
from mcp_server.config import MCPSettings

ORG_ID = uuid4()
INCIDENT_ID = uuid4()


def _settings() -> MCPSettings:
    return MCPSettings(
        api_base_url="http://devpulse.test/api/v1",
        access_token=SecretStr("test-token"),
        org_id=ORG_ID,
    )


def _client(handler) -> DevPulseClient:
    return DevPulseClient(_settings(), transport=httpx.MockTransport(handler))


async def test_list_incidents_sends_bearer_token_and_org_scoped_path() -> None:
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["path"] = request.url.path
        captured["auth"] = request.headers["authorization"]
        return httpx.Response(200, json=[{"id": str(INCIDENT_ID), "title": "Database is slow"}])

    client = _client(handler)
    result = await client.list_incidents()

    assert captured["method"] == "GET"
    assert captured["path"] == f"/api/v1/organizations/{ORG_ID}/incidents"
    assert captured["auth"] == "Bearer test-token"
    assert result == [{"id": str(INCIDENT_ID), "title": "Database is slow"}]
    await client.aclose()


async def test_get_incident() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/api/v1/organizations/{ORG_ID}/incidents/{INCIDENT_ID}"
        return httpx.Response(200, json={"id": str(INCIDENT_ID)})

    client = _client(handler)
    result = await client.get_incident(INCIDENT_ID)
    assert result == {"id": str(INCIDENT_ID)}
    await client.aclose()


async def test_create_incident_sends_expected_json_body() -> None:
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.read()
        return httpx.Response(201, json={"id": str(INCIDENT_ID)})

    client = _client(handler)
    await client.create_incident(title="DB down", severity="sev1")

    import json

    body = json.loads(captured["body"])
    assert body == {
        "title": "DB down",
        "severity": "sev1",
        "description": None,
        "service_id": None,
    }
    await client.aclose()


async def test_create_incident_with_service_id_serializes_uuid_as_string() -> None:
    service_id = uuid4()
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = request.read()
        return httpx.Response(201, json={})

    client = _client(handler)
    await client.create_incident(title="x", severity="sev2", service_id=service_id)

    import json

    body = json.loads(captured["body"])
    assert body["service_id"] == str(service_id)
    await client.aclose()


async def test_update_incident_status() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PATCH"
        assert request.url.path.endswith(f"/incidents/{INCIDENT_ID}/status")
        return httpx.Response(200, json={"incident_status": "resolved"})

    client = _client(handler)
    result = await client.update_incident_status(INCIDENT_ID, "resolved")
    assert result == {"incident_status": "resolved"}
    await client.aclose()


async def test_triage_incident() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path.endswith(f"/incidents/{INCIDENT_ID}/triage")
        return httpx.Response(201, json={"summary": "likely a slow query"})

    client = _client(handler)
    result = await client.triage_incident(INCIDENT_ID)
    assert result == {"summary": "likely a slow query"}
    await client.aclose()


async def test_list_incident_triages() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        return httpx.Response(200, json=[{"id": "1"}, {"id": "2"}])

    client = _client(handler)
    result = await client.list_incident_triages(INCIDENT_ID)
    assert len(result) == 2
    await client.aclose()


async def test_generate_postmortem() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path.endswith(f"/incidents/{INCIDENT_ID}/postmortem")
        return httpx.Response(201, json={"content": "## Summary\n..."})

    client = _client(handler)
    result = await client.generate_postmortem(INCIDENT_ID)
    assert result == {"content": "## Summary\n..."}
    await client.aclose()


async def test_list_postmortems() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path.endswith(f"/incidents/{INCIDENT_ID}/postmortem")
        return httpx.Response(200, json=[{"id": "1"}])

    client = _client(handler)
    result = await client.list_postmortems(INCIDENT_ID)
    assert result == [{"id": "1"}]
    await client.aclose()


async def test_list_services() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/api/v1/organizations/{ORG_ID}/services"
        return httpx.Response(200, json=[{"name": "Checkout"}])

    client = _client(handler)
    result = await client.list_services()
    assert result == [{"name": "Checkout"}]
    await client.aclose()


async def test_204_response_returns_none() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(204)

    client = _client(handler)
    result = await client._request("DELETE", "/whatever")
    assert result is None
    await client.aclose()


async def test_error_response_raises_devpulse_api_error_with_detail() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"detail": "Incident not found"})

    client = _client(handler)
    with pytest.raises(DevPulseAPIError) as exc_info:
        await client.get_incident(INCIDENT_ID)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Incident not found"
    await client.aclose()


async def test_error_response_without_json_body_falls_back_to_text() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="internal server error")

    client = _client(handler)
    with pytest.raises(DevPulseAPIError) as exc_info:
        await client.list_incidents()

    assert exc_info.value.status_code == 500
    assert "internal server error" in exc_info.value.detail
    await client.aclose()

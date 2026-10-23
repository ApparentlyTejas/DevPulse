"""Unit tests for the MCP server's tool functions.

`@mcp.tool()` registers the function but returns it unchanged (verified:
`mcp_server.server.list_incidents` is a plain callable), so these call the
tools directly and mock `mcp_server.server.get_client()` rather than
exercising the MCP protocol transport itself — the point here is that each
tool parses its string/UUID arguments correctly and calls the right client
method, not that FastMCP's wire protocol works (that's the SDK's job).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

from mcp_server import server

INCIDENT_ID = uuid4()
SERVICE_ID = uuid4()


async def test_list_incidents_calls_client() -> None:
    client = AsyncMock()
    client.list_incidents.return_value = [{"id": str(INCIDENT_ID)}]
    with patch.object(server, "get_client", return_value=client):
        result = await server.list_incidents()
    assert result == [{"id": str(INCIDENT_ID)}]
    client.list_incidents.assert_awaited_once_with()


async def test_get_incident_parses_uuid() -> None:
    client = AsyncMock()
    client.get_incident.return_value = {"id": str(INCIDENT_ID)}
    with patch.object(server, "get_client", return_value=client):
        result = await server.get_incident(str(INCIDENT_ID))
    assert result == {"id": str(INCIDENT_ID)}
    client.get_incident.assert_awaited_once_with(INCIDENT_ID)


async def test_create_incident_passes_all_fields() -> None:
    client = AsyncMock()
    client.create_incident.return_value = {"id": str(INCIDENT_ID)}
    with patch.object(server, "get_client", return_value=client):
        await server.create_incident(
            title="DB down",
            severity="sev1",
            description="connection pool exhausted",
            service_id=str(SERVICE_ID),
        )
    client.create_incident.assert_awaited_once_with(
        title="DB down",
        severity="sev1",
        description="connection pool exhausted",
        service_id=SERVICE_ID,
    )


async def test_create_incident_without_service_id_passes_none() -> None:
    client = AsyncMock()
    client.create_incident.return_value = {}
    with patch.object(server, "get_client", return_value=client):
        await server.create_incident(title="x", severity="sev3")
    client.create_incident.assert_awaited_once_with(
        title="x", severity="sev3", description=None, service_id=None
    )


async def test_update_incident_status_parses_uuid() -> None:
    client = AsyncMock()
    client.update_incident_status.return_value = {"incident_status": "resolved"}
    with patch.object(server, "get_client", return_value=client):
        result = await server.update_incident_status(str(INCIDENT_ID), "resolved")
    assert result == {"incident_status": "resolved"}
    client.update_incident_status.assert_awaited_once_with(INCIDENT_ID, "resolved")


async def test_triage_incident_parses_uuid() -> None:
    client = AsyncMock()
    client.triage_incident.return_value = {"summary": "likely a slow query"}
    with patch.object(server, "get_client", return_value=client):
        result = await server.triage_incident(str(INCIDENT_ID))
    assert result == {"summary": "likely a slow query"}
    client.triage_incident.assert_awaited_once_with(INCIDENT_ID)


async def test_list_incident_triages_parses_uuid() -> None:
    client = AsyncMock()
    client.list_incident_triages.return_value = [{"id": "1"}]
    with patch.object(server, "get_client", return_value=client):
        result = await server.list_incident_triages(str(INCIDENT_ID))
    assert result == [{"id": "1"}]
    client.list_incident_triages.assert_awaited_once_with(INCIDENT_ID)


async def test_generate_postmortem_parses_uuid() -> None:
    client = AsyncMock()
    client.generate_postmortem.return_value = {"content": "## Summary\n..."}
    with patch.object(server, "get_client", return_value=client):
        result = await server.generate_postmortem(str(INCIDENT_ID))
    assert result == {"content": "## Summary\n..."}
    client.generate_postmortem.assert_awaited_once_with(INCIDENT_ID)


async def test_list_postmortems_parses_uuid() -> None:
    client = AsyncMock()
    client.list_postmortems.return_value = [{"id": "1"}]
    with patch.object(server, "get_client", return_value=client):
        result = await server.list_postmortems(str(INCIDENT_ID))
    assert result == [{"id": "1"}]
    client.list_postmortems.assert_awaited_once_with(INCIDENT_ID)


async def test_list_services_calls_client() -> None:
    client = AsyncMock()
    client.list_services.return_value = [{"name": "Checkout"}]
    with patch.object(server, "get_client", return_value=client):
        result = await server.list_services()
    assert result == [{"name": "Checkout"}]
    client.list_services.assert_awaited_once_with()

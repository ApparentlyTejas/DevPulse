"""DevPulse MCP server.

Exposes incidents, services, and Claude-backed incident triage as MCP
tools, so an MCP client (Claude Desktop, or any other client speaking the
protocol) can browse and act on a DevPulse organization's operational data
directly, rather than going through the web UI.

Run with: `devpulse-mcp` (stdio transport — see pyproject.toml's
[project.scripts]).  Configure via DEVPULSE_MCP_* environment variables
(see mcp_server/config.py): an API base URL, an access token, and the org
to scope every call to.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from mcp.server.fastmcp import FastMCP

from mcp_server.client import get_client

mcp = FastMCP("devpulse")


@mcp.tool()
async def list_incidents() -> list[dict[str, Any]]:
    """List every incident in the configured organization, newest first."""
    return await get_client().list_incidents()


@mcp.tool()
async def get_incident(incident_id: str) -> dict[str, Any]:
    """Get one incident's full detail by its id."""
    return await get_client().get_incident(UUID(incident_id))


@mcp.tool()
async def create_incident(
    title: str,
    severity: str,
    description: str | None = None,
    service_id: str | None = None,
) -> dict[str, Any]:
    """File a new incident.

    severity must be one of: sev1, sev2, sev3, sev4 (sev1 = complete outage).
    service_id is optional; omit it for an org-level incident not tied to a
    single service.
    """
    return await get_client().create_incident(
        title=title,
        severity=severity,
        description=description,
        service_id=UUID(service_id) if service_id else None,
    )


@mcp.tool()
async def update_incident_status(incident_id: str, status: str) -> dict[str, Any]:
    """Advance an incident's status.

    status must be one of: open, investigating, identified, monitoring,
    resolved. Only forward transitions along that lifecycle are valid; see
    the DevPulse API's 422 response for the specific allowed next steps if
    this fails.
    """
    return await get_client().update_incident_status(UUID(incident_id), status)


@mcp.tool()
async def triage_incident(incident_id: str) -> dict[str, Any]:
    """Ask Claude to triage an incident: a summary, a suggested severity,
    and a confidence score, based on its title, description, status, and
    linked service. Each call adds a new entry to the incident's triage
    history rather than replacing the last one."""
    return await get_client().triage_incident(UUID(incident_id))


@mcp.tool()
async def list_incident_triages(incident_id: str) -> list[dict[str, Any]]:
    """List an incident's past triage runs, newest first."""
    return await get_client().list_incident_triages(UUID(incident_id))


@mcp.tool()
async def generate_postmortem(incident_id: str) -> dict[str, Any]:
    """Generate a postmortem for an incident, grounded strictly in its
    recorded facts: title, severity, status, open/resolve timestamps, linked
    service, description, and the full triage history. Claude is instructed
    not to invent a root cause, metric, or system name the data doesn't
    support — if the facts don't establish a root cause, the postmortem says
    so plainly instead of guessing. Each call adds a new entry to the
    incident's postmortem history rather than replacing the last one."""
    return await get_client().generate_postmortem(UUID(incident_id))


@mcp.tool()
async def list_postmortems(incident_id: str) -> list[dict[str, Any]]:
    """List an incident's past generated postmortems, newest first."""
    return await get_client().list_postmortems(UUID(incident_id))


@mcp.tool()
async def list_services() -> list[dict[str, Any]]:
    """List every service in the configured organization."""
    return await get_client().list_services()


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()

"""AI triage service: ask Claude to summarize and triage an incident.

Design notes:

- We reuse `incidents.service.get_incident` for the org-membership check and
  incident lookup rather than duplicating it, so triage inherits the exact
  same authorization rules as every other incident endpoint.
- We ask Claude for structured output via tool use (a single forced tool
  call) rather than parsing free-form text, so the response shape is
  reliable regardless of model phrasing.
- Anthropic API failures are wrapped in `AITriageError` so the router has
  one exception type to translate into a 502, instead of leaking SDK
  exception types up through the HTTP layer.
"""

from __future__ import annotations

from uuid import UUID

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.modules.ai.client import get_claude_client
from app.modules.ai.models import IncidentTriage
from app.modules.incidents import service as incidents_service
from app.modules.incidents.models import Incident, IncidentSeverity
from app.modules.services.models import Service

# Re-exported so callers only need to import from `ai.service` for the
# errors they can expect, alongside the incident-lookup errors below.
IncidentNotFoundError = incidents_service.IncidentNotFoundError
OrgNotFoundError = incidents_service.OrgNotFoundError


class AITriageError(Exception):
    """Raised when the Claude API call itself fails (network, auth, rate limit)."""


_TRIAGE_TOOL = {
    "name": "submit_triage",
    "description": "Submit a structured triage assessment for an incident.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": (
                    "2-4 sentence plain-language summary: likely root cause, "
                    "blast radius, and a concrete next diagnostic step."
                ),
            },
            "suggested_severity": {
                "type": "string",
                "enum": [s.value for s in IncidentSeverity],
                "description": "Severity you'd assign given the description.",
            },
            "confidence": {
                "type": "number",
                "description": "Confidence in this assessment, from 0.0 to 1.0.",
            },
        },
        "required": ["summary", "suggested_severity", "confidence"],
    },
}


def _build_prompt(incident: Incident, service: Service | None) -> str:
    lines = [
        f"Incident title: {incident.title}",
        f"Current severity: {incident.severity.value}",
        f"Current status: {incident.incident_status.value}",
    ]
    if service is not None:
        lines.append(f"Affected service: {service.name}")
    if incident.description:
        lines.append(f"Description: {incident.description}")
    lines.append(
        "\nYou are an SRE triage assistant. Review the incident above and "
        "call `submit_triage` with your assessment."
    )
    return "\n".join(lines)


async def _call_claude(
    settings: Settings, incident: Incident, service: Service | None
) -> dict[str, object]:
    client = get_claude_client(settings)
    try:
        response = await client.messages.create(
            model=settings.ai.model,
            max_tokens=1024,
            tools=[_TRIAGE_TOOL],
            tool_choice={"type": "tool", "name": "submit_triage"},
            messages=[{"role": "user", "content": _build_prompt(incident, service)}],
        )  # type: ignore[call-overload]  # SDK's Literal model union rejects our settings-driven model str
    except anthropic.APIError as exc:
        raise AITriageError(str(exc)) from exc

    for block in response.content:
        if block.type == "tool_use" and block.name == "submit_triage":
            return dict(block.input)

    raise AITriageError("Claude did not return a submit_triage tool call")


async def triage_incident(
    db: AsyncSession,
    settings: Settings,
    org_id: UUID,
    incident_id: UUID,
    user_id: UUID,
) -> IncidentTriage:
    """Run Claude triage on an incident and persist the result."""
    incident = await incidents_service.get_incident(db, org_id, incident_id, user_id)

    service: Service | None = None
    if incident.service_id is not None:
        service = await db.scalar(select(Service).where(Service.id == incident.service_id))

    result = await _call_claude(settings, incident, service)

    suggested_severity: IncidentSeverity | None
    try:
        suggested_severity = IncidentSeverity(result["suggested_severity"])
    except (KeyError, ValueError):
        suggested_severity = None

    confidence_raw = result.get("confidence", 0.0)
    confidence = max(0.0, min(1.0, float(confidence_raw)))  # type: ignore[arg-type]

    triage = IncidentTriage(
        incident_id=incident.id,
        summary=str(result.get("summary", "")),
        suggested_severity=suggested_severity,
        confidence=confidence,
        model=settings.ai.model,
    )
    db.add(triage)
    await db.commit()
    await db.refresh(triage)
    return triage


async def list_triages(
    db: AsyncSession,
    org_id: UUID,
    incident_id: UUID,
    user_id: UUID,
) -> list[IncidentTriage]:
    incident = await incidents_service.get_incident(db, org_id, incident_id, user_id)
    result = await db.execute(
        select(IncidentTriage)
        .where(IncidentTriage.incident_id == incident.id)
        .order_by(IncidentTriage.created_at.desc())
    )
    return list(result.scalars().all())

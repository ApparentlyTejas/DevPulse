"""AI service: Claude-backed incident triage and postmortem generation.

Design notes:

- We reuse `incidents.service.get_incident` for the org-membership check and
  incident lookup rather than duplicating it, so every AI feature here
  inherits the exact same authorization rules as every other incident
  endpoint.
- Triage asks Claude for structured output via tool use (a single forced
  tool call), since it's a few short fields and we want a reliable shape
  regardless of model phrasing. A postmortem is a long-form document, so it
  asks for plain markdown text instead — forcing a document into a JSON
  schema buys nothing there.
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
from app.modules.ai.models import IncidentTriage, Postmortem
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


async def _get_linked_service(db: AsyncSession, incident: Incident) -> Service | None:
    if incident.service_id is None:
        return None
    return await db.scalar(select(Service).where(Service.id == incident.service_id))  # type: ignore[no-any-return]


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
    service = await _get_linked_service(db, incident)

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


async def _fetch_triages(
    db: AsyncSession, incident_id: UUID, *, ascending: bool
) -> list[IncidentTriage]:
    order = IncidentTriage.created_at.asc() if ascending else IncidentTriage.created_at.desc()
    result = await db.execute(
        select(IncidentTriage).where(IncidentTriage.incident_id == incident_id).order_by(order)
    )
    return list(result.scalars().all())


async def list_triages(
    db: AsyncSession,
    org_id: UUID,
    incident_id: UUID,
    user_id: UUID,
) -> list[IncidentTriage]:
    incident = await incidents_service.get_incident(db, org_id, incident_id, user_id)
    return await _fetch_triages(db, incident.id, ascending=False)


# ---------------------------------------------------------------------------
# Postmortems
# ---------------------------------------------------------------------------


def _build_postmortem_prompt(
    incident: Incident, service: Service | None, triages: list[IncidentTriage]
) -> str:
    lines = [
        "Incident facts (this is the complete record available — do not invent "
        "any detail, number, system name, or root cause that isn't stated below; "
        "say explicitly where information is missing instead of guessing):",
        f"- Title: {incident.title}",
        f"- Severity: {incident.severity.value}",
        f"- Status: {incident.incident_status.value}",
        f"- Opened: {incident.created_at.isoformat()}",
    ]
    if incident.resolved_at is not None:
        lines.append(f"- Resolved: {incident.resolved_at.isoformat()}")
    else:
        lines.append("- Resolved: not yet resolved as of this writing")
    if service is not None:
        lines.append(f"- Affected service: {service.name}")
    if incident.description:
        lines.append(f"- Description: {incident.description}")

    if triages:
        lines.append("\nTriage history (chronological, oldest first):")
        for t in triages:
            lines.append(
                f"- {t.created_at.isoformat()}: {t.summary} "
                f"(suggested severity: {t.suggested_severity.value if t.suggested_severity else 'unclear'}, "
                f"confidence: {t.confidence:.2f})"
            )
    else:
        lines.append("\nNo triage runs were recorded for this incident.")

    lines.append(
        "\nYou are an SRE writing a postmortem from the facts above, nothing "
        "else. Write it in markdown with these sections: ## Summary, "
        "## Timeline (derived only from the timestamps given above), "
        "## Impact, ## Root Cause (if the facts above don't establish a root "
        "cause, say so plainly and name what information would be needed "
        "instead of guessing one), ## Resolution, ## Follow-ups. Keep it "
        "concise — this is read by the team, not padded for length."
    )
    return "\n".join(lines)


async def _call_claude_text(settings: Settings, prompt: str) -> str:
    client = get_claude_client(settings)
    try:
        response = await client.messages.create(
            model=settings.ai.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as exc:
        raise AITriageError(str(exc)) from exc

    text_blocks = [block.text for block in response.content if block.type == "text"]
    if not text_blocks:
        raise AITriageError("Claude did not return any text content")
    return "\n".join(text_blocks).strip()


async def generate_postmortem(
    db: AsyncSession,
    settings: Settings,
    org_id: UUID,
    incident_id: UUID,
    user_id: UUID,
) -> Postmortem:
    """Generate a postmortem from an incident's real recorded data and persist it."""
    incident = await incidents_service.get_incident(db, org_id, incident_id, user_id)
    service = await _get_linked_service(db, incident)
    triages = await _fetch_triages(db, incident.id, ascending=True)

    content = await _call_claude_text(
        settings, _build_postmortem_prompt(incident, service, triages)
    )

    postmortem = Postmortem(incident_id=incident.id, content=content, model=settings.ai.model)
    db.add(postmortem)
    await db.commit()
    await db.refresh(postmortem)
    return postmortem


async def list_postmortems(
    db: AsyncSession,
    org_id: UUID,
    incident_id: UUID,
    user_id: UUID,
) -> list[Postmortem]:
    incident = await incidents_service.get_incident(db, org_id, incident_id, user_id)
    result = await db.execute(
        select(Postmortem)
        .where(Postmortem.incident_id == incident.id)
        .order_by(Postmortem.created_at.desc())
    )
    return list(result.scalars().all())

"""Thin async HTTP client wrapping the DevPulse REST API.

Every method here is a direct call against an existing `app/modules/*`
endpoint. Intentionally dumb: it does no business logic of its own, so the
MCP server can't drift from the authorization rules and validation the API
already enforces.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any
from uuid import UUID

import httpx

from mcp_server.config import MCPSettings, get_mcp_settings


class DevPulseAPIError(Exception):
    """Raised when the DevPulse API returns an error response."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"DevPulse API error {status_code}: {detail}")


class DevPulseClient:
    def __init__(
        self, settings: MCPSettings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._settings = settings
        self._org_path = f"/organizations/{settings.org_id}"
        self._client = httpx.AsyncClient(
            base_url=settings.api_base_url,
            headers={"Authorization": f"Bearer {settings.access_token.get_secret_value()}"},
            timeout=settings.request_timeout_seconds,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._client.request(method, path, **kwargs)
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", response.text)
            except ValueError:
                detail = response.text
            raise DevPulseAPIError(response.status_code, str(detail))
        if response.status_code == 204:
            return None
        return response.json()

    # ---------------------------------------------------------------- incidents

    async def list_incidents(self) -> list[dict[str, Any]]:
        return await self._request("GET", f"{self._org_path}/incidents")  # type: ignore[no-any-return]

    async def get_incident(self, incident_id: UUID) -> dict[str, Any]:
        return await self._request("GET", f"{self._org_path}/incidents/{incident_id}")  # type: ignore[no-any-return]

    async def create_incident(
        self,
        title: str,
        severity: str,
        description: str | None = None,
        service_id: UUID | None = None,
    ) -> dict[str, Any]:
        payload = {
            "title": title,
            "severity": severity,
            "description": description,
            "service_id": str(service_id) if service_id else None,
        }
        return await self._request("POST", f"{self._org_path}/incidents", json=payload)  # type: ignore[no-any-return]

    async def update_incident_status(self, incident_id: UUID, status: str) -> dict[str, Any]:
        return await self._request(  # type: ignore[no-any-return]
            "PATCH",
            f"{self._org_path}/incidents/{incident_id}/status",
            json={"incident_status": status},
        )

    # -------------------------------------------------------------------- ai

    async def triage_incident(self, incident_id: UUID) -> dict[str, Any]:
        return await self._request(  # type: ignore[no-any-return]
            "POST", f"{self._org_path}/incidents/{incident_id}/triage"
        )

    async def list_incident_triages(self, incident_id: UUID) -> list[dict[str, Any]]:
        return await self._request(  # type: ignore[no-any-return]
            "GET", f"{self._org_path}/incidents/{incident_id}/triage"
        )

    async def generate_postmortem(self, incident_id: UUID) -> dict[str, Any]:
        return await self._request(  # type: ignore[no-any-return]
            "POST", f"{self._org_path}/incidents/{incident_id}/postmortem"
        )

    async def list_postmortems(self, incident_id: UUID) -> list[dict[str, Any]]:
        return await self._request(  # type: ignore[no-any-return]
            "GET", f"{self._org_path}/incidents/{incident_id}/postmortem"
        )

    # --------------------------------------------------------------- services

    async def list_services(self) -> list[dict[str, Any]]:
        return await self._request("GET", f"{self._org_path}/services")  # type: ignore[no-any-return]


@lru_cache(maxsize=1)
def get_client() -> DevPulseClient:
    return DevPulseClient(get_mcp_settings())

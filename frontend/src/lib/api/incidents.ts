/**
 * Incidents API functions. Mapped onto the backend's actual response shape
 * (`backend/app/modules/incidents/schemas.py`'s `IncidentOut`: snake_case
 * `org_id`/`service_id`/`created_by`/`incident_status`/`resolved_at`/
 * `created_at`/`updated_at`) and its paginated list envelope
 * (`app/core/pagination.py`'s `Page`, already mirrored by `services.ts` and
 * `alerts.ts`).
 *
 * The list endpoint (`GET /organizations/{org_id}/incidents`) takes
 * `status`/`severity` query params (added in Task 1 specifically for this
 * page's filtering) -- note the query param is named `status`, but the
 * field it filters on in the response body is `incident_status`. These are
 * two different names for two different things: a query param vs. a
 * response field. See `backend/app/modules/incidents/router.py`'s
 * `list_incidents`, which aliases its internal `incident_status` parameter
 * to the external `status` query param via `Query(alias="status")`.
 */

import { apiRequest } from "./client";

export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";
export type IncidentStatus = "open" | "investigating" | "identified" | "monitoring" | "resolved";

// Mirrors `IncidentOut` in `backend/app/modules/incidents/schemas.py`.
export interface Incident {
  id: string;
  org_id: string;
  service_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  incident_status: IncidentStatus;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// Mirrors `app/core/pagination.py`'s `Page` envelope.
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

function incidentsPath(orgId: string): string {
  return `/organizations/${orgId}/incidents`;
}

export interface IncidentFilters {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
}

export async function listIncidents(
  orgId: string,
  filters: IncidentFilters,
  page: { limit: number; offset: number },
): Promise<Page<Incident>> {
  const query = new URLSearchParams({
    limit: String(page.limit),
    offset: String(page.offset),
  });
  if (filters.status) {
    query.set("status", filters.status);
  }
  if (filters.severity) {
    query.set("severity", filters.severity);
  }
  return apiRequest<Page<Incident>>(`${incidentsPath(orgId)}?${query.toString()}`);
}

// Mirrors `CreateIncidentRequest`: `service_id` is optional -- linking an
// incident to a service is optional, not required.
export interface CreateIncidentData {
  title: string;
  description?: string;
  severity: IncidentSeverity;
  service_id?: string;
}

export async function createIncident(
  orgId: string,
  data: CreateIncidentData,
): Promise<Incident> {
  const body: Record<string, unknown> = { title: data.title, severity: data.severity };
  if (data.description) {
    body.description = data.description;
  }
  if (data.service_id) {
    body.service_id = data.service_id;
  }
  return apiRequest<Incident>(incidentsPath(orgId), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Mirrors `UpdateIncidentRequest`: no `service_id` -- the backend doesn't
// accept changing the linked service after creation.
export interface UpdateIncidentData {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
}

export async function updateIncident(
  orgId: string,
  incidentId: string,
  data: UpdateIncidentData,
): Promise<Incident> {
  return apiRequest<Incident>(`${incidentsPath(orgId)}/${incidentId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteIncident(orgId: string, incidentId: string): Promise<void> {
  await apiRequest<void>(`${incidentsPath(orgId)}/${incidentId}`, {
    method: "DELETE",
  });
}

export async function getIncident(orgId: string, incidentId: string): Promise<Incident> {
  return apiRequest<Incident>(`${incidentsPath(orgId)}/${incidentId}`);
}

// Mirrors `UpdateIncidentStatusRequest`: the body field is `incident_status`,
// not `status` -- same naming split as the list endpoint's query param (see
// module docstring above), just on the request body this time.
export async function updateIncidentStatus(
  orgId: string,
  incidentId: string,
  status: IncidentStatus,
): Promise<Incident> {
  return apiRequest<Incident>(`${incidentsPath(orgId)}/${incidentId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ incident_status: status }),
  });
}

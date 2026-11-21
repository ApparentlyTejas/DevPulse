/**
 * AI triage API functions. Mirrors `IncidentTriageOut` in
 * `backend/app/modules/ai/schemas.py`.
 *
 * `GET .../triage` returns a bare `IncidentTriage[]`, not the standard
 * `Page` envelope used elsewhere (`incidents.ts`, `alerts.ts`,
 * `services.ts`) -- the backend's own convention for small, naturally
 * bounded histories (see `app/modules/ai/router.py`'s `list_triages`).
 *
 * Both `runTriage` and `listTriages` can 429 (shared per-org AI budget,
 * `app/core/rate_limit.py`'s `rate_limit_by_org`) or, for `runTriage`
 * specifically, 502 if the underlying Claude call itself fails
 * (`AITriageError` -> `detail=f"AI triage failed: {exc}"`). Callers should
 * inspect the thrown `ApiError`'s `status` and `retryAfterSeconds`.
 */

import { apiRequest } from "./client";
import type { IncidentSeverity } from "./incidents";

export interface IncidentTriage {
  id: string;
  incident_id: string;
  summary: string;
  suggested_severity: IncidentSeverity | null;
  confidence: number;
  model: string;
  created_at: string;
}

function triagePath(orgId: string, incidentId: string): string {
  return `/organizations/${orgId}/incidents/${incidentId}/triage`;
}

export async function listTriages(orgId: string, incidentId: string): Promise<IncidentTriage[]> {
  return apiRequest<IncidentTriage[]>(triagePath(orgId, incidentId));
}

export async function runTriage(orgId: string, incidentId: string): Promise<IncidentTriage> {
  return apiRequest<IncidentTriage>(triagePath(orgId, incidentId), { method: "POST" });
}

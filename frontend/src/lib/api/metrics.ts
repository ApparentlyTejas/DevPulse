/**
 * Metrics API functions. Mapped onto the backend's actual response shape
 * (`backend/app/modules/metrics/schemas.py`) and nested under a service
 * (`backend/app/api.py` mounts `metrics_router` at
 * `/organizations/{org_id}/services/{service_id}/metrics`).
 */

import { apiRequest } from "./client";
import type { Page } from "./alerts";

// Mirrors `MetricSnapshotOut` in `backend/app/modules/metrics/schemas.py`.
export interface MetricSnapshot {
  id: string;
  service_id: string;
  org_id: string;
  metric_name: string;
  value: number;
  unit: string | null;
  recorded_at: string;
  created_at: string;
}

function metricsPath(orgId: string, serviceId: string): string {
  return `/organizations/${orgId}/services/${serviceId}/metrics`;
}

export async function listMetrics(
  orgId: string,
  serviceId: string,
  page: { limit: number; offset: number },
): Promise<Page<MetricSnapshot>> {
  const query = new URLSearchParams({
    limit: String(page.limit),
    offset: String(page.offset),
  });
  return apiRequest<Page<MetricSnapshot>>(`${metricsPath(orgId, serviceId)}?${query.toString()}`);
}

// Mirrors `IngestMetricRequest`. `recorded_at` is optional -- the backend
// (`backend/app/modules/metrics/service.py`'s `ingest`) defaults it to
// `datetime.now(UTC)` server-side when it's omitted, so callers can leave
// it out to record "now".
export interface CreateMetricData {
  metric_name: string;
  value: number;
  unit?: string;
  recorded_at?: string;
}

export async function createMetric(
  orgId: string,
  serviceId: string,
  data: CreateMetricData,
): Promise<MetricSnapshot> {
  return apiRequest<MetricSnapshot>(metricsPath(orgId, serviceId), {
    method: "POST",
    body: JSON.stringify(data),
  });
}

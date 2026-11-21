/**
 * Alerts API functions. Mapped onto the backend's actual response shape
 * (`backend/app/modules/alerts/schemas.py`) and nested under a service
 * (`backend/app/api.py` mounts `alerts_router` at
 * `/organizations/{org_id}/services/{service_id}/alerts`).
 *
 * This file currently holds the alert *rule* functions (Task 7). Task 8
 * adds the alert *event* functions to this same file.
 */

import { apiRequest } from "./client";

export type ConditionOperator = "gt" | "gte" | "lt" | "lte" | "eq";
export type AlertSeverity = "info" | "warning" | "critical";

// Mirrors `AlertRuleOut` in `backend/app/modules/alerts/schemas.py`.
export interface AlertRule {
  id: string;
  org_id: string;
  service_id: string;
  name: string;
  metric_name: string;
  condition_operator: ConditionOperator;
  threshold: number;
  window_seconds: number;
  severity: AlertSeverity;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

function rulesPath(orgId: string, serviceId: string): string {
  return `/organizations/${orgId}/services/${serviceId}/alerts/rules`;
}

export async function listAlertRules(orgId: string, serviceId: string): Promise<AlertRule[]> {
  return apiRequest<AlertRule[]>(rulesPath(orgId, serviceId));
}

// Mirrors `CreateAlertRuleRequest`: `metric_name`/`condition_operator` are
// only settable here, at creation -- the backend's `UpdateAlertRuleRequest`
// doesn't accept them (see `updateAlertRule` below).
export interface CreateAlertRuleData {
  name: string;
  metric_name: string;
  condition_operator: ConditionOperator;
  threshold: number;
  window_seconds?: number;
  severity?: AlertSeverity;
  is_enabled?: boolean;
}

export async function createAlertRule(
  orgId: string,
  serviceId: string,
  data: CreateAlertRuleData,
): Promise<AlertRule> {
  return apiRequest<AlertRule>(rulesPath(orgId, serviceId), {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Mirrors `UpdateAlertRuleRequest`: no `metric_name`/`condition_operator`,
// the backend rejects those on update.
export interface UpdateAlertRuleData {
  name?: string;
  threshold?: number;
  window_seconds?: number;
  severity?: AlertSeverity;
  is_enabled?: boolean;
}

export async function updateAlertRule(
  orgId: string,
  serviceId: string,
  ruleId: string,
  data: UpdateAlertRuleData,
): Promise<AlertRule> {
  return apiRequest<AlertRule>(`${rulesPath(orgId, serviceId)}/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteAlertRule(
  orgId: string,
  serviceId: string,
  ruleId: string,
): Promise<void> {
  await apiRequest<void>(`${rulesPath(orgId, serviceId)}/${ruleId}`, {
    method: "DELETE",
  });
}

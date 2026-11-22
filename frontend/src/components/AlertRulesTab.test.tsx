import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { AlertRule } from "../lib/api/alerts";
import { AlertRulesTab } from "./AlertRulesTab";

vi.mock("../lib/api/alerts", () => ({
  listAlertRules: vi.fn(),
  createAlertRule: vi.fn(),
  updateAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
}));

import {
  createAlertRule,
  deleteAlertRule,
  listAlertRules,
  updateAlertRule,
} from "../lib/api/alerts";

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    org_id: "org-1",
    service_id: "svc-1",
    name: "High latency",
    metric_name: "latency_ms",
    condition_operator: "gt",
    threshold: 500,
    window_seconds: 300,
    severity: "warning",
    is_enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AlertRulesTab orgId="org-1" serviceId="svc-1" />
    </QueryClientProvider>,
  );
}

describe("AlertRulesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders a row per alert rule returned by the API", async () => {
    vi.mocked(listAlertRules).mockResolvedValue([
      makeRule({ id: "rule-1", name: "High latency", metric_name: "latency_ms" }),
      makeRule({ id: "rule-2", name: "Error rate", metric_name: "error_rate" }),
    ]);

    renderTab();

    expect(await screen.findByText("High latency")).toBeTruthy();
    expect(screen.getByText("latency_ms")).toBeTruthy();
    expect(screen.getByText("Error rate")).toBeTruthy();
    expect(listAlertRules).toHaveBeenCalledWith("org-1", "svc-1");
  });

  test("shows the empty state when there are no rules", async () => {
    vi.mocked(listAlertRules).mockResolvedValue([]);

    renderTab();

    expect(await screen.findByText(/no alert rules yet/i)).toBeTruthy();
  });

  test("shows an error state and a retry action when the request fails", async () => {
    vi.mocked(listAlertRules).mockRejectedValueOnce(new ApiError(500, "boom"));
    vi.mocked(listAlertRules).mockResolvedValueOnce([]);

    renderTab();

    expect(await screen.findByText(/failed to load alert rules/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText(/no alert rules yet/i)).toBeTruthy();
  });

  test("creates a new rule from the form", async () => {
    vi.mocked(listAlertRules).mockResolvedValue([]);
    vi.mocked(createAlertRule).mockResolvedValue(
      makeRule({ id: "rule-new", name: "New rule", metric_name: "cpu_pct" }),
    );

    renderTab();
    expect(await screen.findByText(/no alert rules yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /new rule/i }));

    await user.type(screen.getByLabelText(/^name$/i), "New rule");
    await user.type(screen.getByLabelText(/metric name/i), "cpu_pct");
    await user.selectOptions(screen.getByLabelText(/condition/i), "gt");
    await user.type(screen.getByLabelText(/threshold/i), "90");

    await user.click(screen.getByRole("button", { name: /create rule/i }));

    await waitFor(() =>
      expect(createAlertRule).toHaveBeenCalledWith("org-1", "svc-1", {
        name: "New rule",
        metric_name: "cpu_pct",
        condition_operator: "gt",
        threshold: 90,
        window_seconds: 300,
        severity: "warning",
        is_enabled: true,
      }),
    );
  });

  test("editing a rule only sends the backend-updatable fields, with metric/condition read-only", async () => {
    vi.mocked(listAlertRules).mockResolvedValue([makeRule()]);
    vi.mocked(updateAlertRule).mockResolvedValue(makeRule({ name: "Renamed" }));

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /edit/i }));

    // metric_name/condition_operator are shown but not editable.
    expect((screen.getByLabelText(/metric name/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/condition/i) as HTMLSelectElement).disabled).toBe(true);

    const nameInput = screen.getByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(updateAlertRule).toHaveBeenCalledWith("org-1", "svc-1", "rule-1", {
        name: "Renamed",
        threshold: 500,
        window_seconds: 300,
        severity: "warning",
        is_enabled: true,
      }),
    );
  });

  test("deletes a rule", async () => {
    vi.mocked(listAlertRules).mockResolvedValue([makeRule()]);
    vi.mocked(deleteAlertRule).mockResolvedValue(undefined);

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deleteAlertRule).toHaveBeenCalledWith("org-1", "svc-1", "rule-1"));
  });

  test("a stale delete (404) surfaces an error and refetches the list", async () => {
    vi.mocked(listAlertRules).mockResolvedValueOnce([makeRule()]);
    vi.mocked(listAlertRules).mockResolvedValueOnce([]);
    vi.mocked(deleteAlertRule).mockRejectedValue(new ApiError(404, "Alert rule not found"));

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByText(/alert rule not found/i)).toBeTruthy();
    await waitFor(() => expect(listAlertRules).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no alert rules yet/i)).toBeTruthy();
  });

  test("invalidates the list on a 404 edit (not just on success), so the row drops after Cancel", async () => {
    vi.mocked(listAlertRules).mockResolvedValueOnce([makeRule()]);
    vi.mocked(updateAlertRule).mockRejectedValue(new ApiError(404, "Alert rule not found"));
    vi.mocked(listAlertRules).mockResolvedValueOnce([]);

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    // `onSettled` invalidation fires on this failed submit already, not
    // only on a later success -- the row doesn't wait for Cancel to drop.
    await waitFor(() => expect(listAlertRules).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(await screen.findByText(/no alert rules yet/i)).toBeTruthy();
  });
});

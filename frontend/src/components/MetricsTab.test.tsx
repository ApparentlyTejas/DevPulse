import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { MetricSnapshot } from "../lib/api/metrics";
import { MetricsTab } from "./MetricsTab";

vi.mock("../lib/api/metrics", () => ({
  listMetrics: vi.fn(),
  createMetric: vi.fn(),
}));

import { createMetric, listMetrics } from "../lib/api/metrics";

function makeSnapshot(overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    id: "snap-1",
    service_id: "svc-1",
    org_id: "org-1",
    metric_name: "cpu_usage",
    value: 42.5,
    unit: "percent",
    recorded_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MetricsTab orgId="org-1" serviceId="svc-1" />
    </QueryClientProvider>,
  );
}

describe("MetricsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders a row per metric snapshot returned by the API", async () => {
    vi.mocked(listMetrics).mockResolvedValue({
      items: [
        makeSnapshot({ id: "snap-1", metric_name: "cpu_usage" }),
        makeSnapshot({ id: "snap-2", metric_name: "memory_usage" }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    });

    renderTab();

    expect(await screen.findByText("cpu_usage")).toBeTruthy();
    expect(screen.getByText("memory_usage")).toBeTruthy();
    expect(listMetrics).toHaveBeenCalledWith("org-1", "svc-1", { limit: 20, offset: 0 });
  });

  test("shows the empty state when there are no snapshots", async () => {
    vi.mocked(listMetrics).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderTab();

    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();
  });

  test("shows an error state and a retry action when the request fails", async () => {
    vi.mocked(listMetrics).mockRejectedValueOnce(new ApiError(500, "boom"));
    vi.mocked(listMetrics).mockResolvedValueOnce({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderTab();

    expect(await screen.findByText(/failed to load metrics/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();
  });

  test("paginates using limit/offset sent to the API", async () => {
    vi.mocked(listMetrics).mockResolvedValue({
      items: [makeSnapshot()],
      total: 45,
      limit: 20,
      offset: 0,
    });

    renderTab();
    expect(await screen.findByText("cpu_usage")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(listMetrics).toHaveBeenCalledWith("org-1", "svc-1", { limit: 20, offset: 20 }),
    );

    await user.click(screen.getByRole("button", { name: /previous/i }));

    await waitFor(() =>
      expect(listMetrics).toHaveBeenCalledWith("org-1", "svc-1", { limit: 20, offset: 0 }),
    );
  });

  test("submitting the record form creates a snapshot, closes the dialog, and refreshes the list", async () => {
    vi.mocked(listMetrics).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    vi.mocked(createMetric).mockResolvedValue(makeSnapshot({ metric_name: "error_rate" }));

    renderTab();
    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record snapshot/i }));
    await user.type(screen.getByLabelText(/metric name/i), "error_rate");
    await user.type(screen.getByLabelText(/^value$/i), "3.2");
    await user.type(screen.getByLabelText(/unit/i), "percent");
    await user.click(screen.getByRole("button", { name: /save snapshot/i }));

    await waitFor(() =>
      expect(createMetric).toHaveBeenCalledWith("org-1", "svc-1", {
        metric_name: "error_rate",
        value: 3.2,
        unit: "percent",
      }),
    );

    await waitFor(() => expect(listMetrics).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /save snapshot/i })).toBeNull(),
    );
  });

  test("cancelling the dialog discards the form without creating a snapshot", async () => {
    vi.mocked(listMetrics).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderTab();
    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record snapshot/i }));
    await user.type(screen.getByLabelText(/metric name/i), "cpu_usage");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /save snapshot/i })).toBeNull(),
    );
    expect(createMetric).not.toHaveBeenCalled();
  });

  test("resets to the first page after recording a snapshot while on a later page", async () => {
    vi.mocked(listMetrics).mockResolvedValue({
      items: [makeSnapshot()],
      total: 45,
      limit: 20,
      offset: 0,
    });
    vi.mocked(createMetric).mockResolvedValue(makeSnapshot({ metric_name: "error_rate" }));

    renderTab();
    expect(await screen.findByText("cpu_usage")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() =>
      expect(listMetrics).toHaveBeenCalledWith("org-1", "svc-1", { limit: 20, offset: 20 }),
    );

    await user.click(screen.getByRole("button", { name: /record snapshot/i }));
    await user.type(screen.getByLabelText(/metric name/i), "error_rate");
    await user.type(screen.getByLabelText(/^value$/i), "3.2");
    await user.click(screen.getByRole("button", { name: /save snapshot/i }));

    await waitFor(() => expect(createMetric).toHaveBeenCalled());
    await waitFor(() =>
      expect(listMetrics).toHaveBeenCalledWith("org-1", "svc-1", { limit: 20, offset: 0 }),
    );
  });

  test("omitting the recorded-at field leaves it out of the create request so the backend defaults it", async () => {
    vi.mocked(listMetrics).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    vi.mocked(createMetric).mockResolvedValue(makeSnapshot());

    renderTab();
    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record snapshot/i }));
    await user.type(screen.getByLabelText(/metric name/i), "cpu_usage");
    await user.type(screen.getByLabelText(/^value$/i), "10");
    await user.click(screen.getByRole("button", { name: /save snapshot/i }));

    await waitFor(() => expect(createMetric).toHaveBeenCalled());
    const payload = vi.mocked(createMetric).mock.calls[0][2];
    expect(payload.recorded_at).toBeUndefined();
    expect(payload.unit).toBeUndefined();
  });

  test("shows a validation error when required fields are missing", async () => {
    vi.mocked(listMetrics).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderTab();
    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record snapshot/i }));
    await user.click(screen.getByRole("button", { name: /save snapshot/i }));

    expect(await screen.findByText(/metric name is required/i)).toBeTruthy();
    expect(createMetric).not.toHaveBeenCalled();
  });

  test("surfaces an API error from the create request", async () => {
    vi.mocked(listMetrics).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    vi.mocked(createMetric).mockRejectedValue(new ApiError(422, "Invalid metric value"));

    renderTab();
    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /record snapshot/i }));
    await user.type(screen.getByLabelText(/metric name/i), "cpu_usage");
    await user.type(screen.getByLabelText(/^value$/i), "10");
    await user.click(screen.getByRole("button", { name: /save snapshot/i }));

    expect(await screen.findByText(/invalid metric value/i)).toBeTruthy();
  });
});

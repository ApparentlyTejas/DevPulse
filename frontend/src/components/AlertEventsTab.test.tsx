import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { AlertEvent } from "../lib/api/alerts";
import { AlertEventsTab } from "./AlertEventsTab";

vi.mock("../lib/api/alerts", () => ({
  listAlertEvents: vi.fn(),
  updateAlertEventStatus: vi.fn(),
}));

import { listAlertEvents, updateAlertEventStatus } from "../lib/api/alerts";

function makeEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: "event-1",
    org_id: "org-1",
    service_id: "svc-1",
    rule_id: "rule-1",
    severity: "warning",
    title: "High latency",
    message: "p99 latency exceeded threshold",
    alert_status: "open",
    acknowledged_at: null,
    resolved_at: null,
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
      <AlertEventsTab orgId="org-1" serviceId="svc-1" />
    </QueryClientProvider>,
  );
}

describe("AlertEventsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders a row per alert event returned by the API", async () => {
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [
        makeEvent({ id: "event-1", title: "High latency" }),
        makeEvent({ id: "event-2", title: "Error spike" }),
      ],
      total: 2,
      limit: 20,
      offset: 0,
    });

    renderTab();

    expect(await screen.findByText("High latency")).toBeTruthy();
    expect(screen.getByText("Error spike")).toBeTruthy();
    expect(listAlertEvents).toHaveBeenCalledWith("org-1", "svc-1", { limit: 20, offset: 0 });
  });

  test("shows the empty state when there are no events", async () => {
    vi.mocked(listAlertEvents).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderTab();

    expect(await screen.findByText(/no alert events yet/i)).toBeTruthy();
  });

  test("shows an error state and a retry action when the request fails", async () => {
    vi.mocked(listAlertEvents).mockRejectedValueOnce(new ApiError(500, "boom"));
    vi.mocked(listAlertEvents).mockResolvedValueOnce({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderTab();

    expect(await screen.findByText(/failed to load alert events/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText(/no alert events yet/i)).toBeTruthy();
  });

  test("paginates using limit/offset sent to the API", async () => {
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [makeEvent()],
      total: 45,
      limit: 20,
      offset: 0,
    });

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(listAlertEvents).toHaveBeenCalledWith("org-1", "svc-1", { limit: 20, offset: 20 }),
    );
  });

  test("an open event offers acknowledge and resolve actions", async () => {
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [makeEvent({ alert_status: "open" })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    vi.mocked(updateAlertEventStatus).mockResolvedValue(
      makeEvent({ alert_status: "acknowledged" }),
    );

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    expect(screen.getByRole("button", { name: /acknowledge/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /acknowledge/i }));

    await waitFor(() =>
      expect(updateAlertEventStatus).toHaveBeenCalledWith(
        "org-1",
        "svc-1",
        "event-1",
        "acknowledged",
      ),
    );
  });

  test("an acknowledged event only offers resolve, not re-opening or re-acknowledging", async () => {
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [makeEvent({ alert_status: "acknowledged" })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    vi.mocked(updateAlertEventStatus).mockResolvedValue(makeEvent({ alert_status: "resolved" }));

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    expect(screen.queryByRole("button", { name: /acknowledge/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open/i })).toBeNull();
    const resolveButton = screen.getByRole("button", { name: /^resolve$/i });

    const user = userEvent.setup();
    await user.click(resolveButton);

    await waitFor(() =>
      expect(updateAlertEventStatus).toHaveBeenCalledWith("org-1", "svc-1", "event-1", "resolved"),
    );
  });

  test("a resolved event offers no status actions", async () => {
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [makeEvent({ alert_status: "resolved" })],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    expect(screen.queryByRole("button", { name: /acknowledge/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^resolve$/i })).toBeNull();
  });

  test("a stale status update (422 invalid transition) surfaces an error and refetches", async () => {
    vi.mocked(listAlertEvents).mockResolvedValueOnce({
      items: [makeEvent({ alert_status: "open" })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    vi.mocked(listAlertEvents).mockResolvedValueOnce({
      items: [makeEvent({ alert_status: "resolved" })],
      total: 1,
      limit: 20,
      offset: 0,
    });
    vi.mocked(updateAlertEventStatus).mockRejectedValue(
      new ApiError(422, "Cannot transition from resolved to acknowledged"),
    );

    renderTab();
    expect(await screen.findByText("High latency")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /acknowledge/i }));

    expect(await screen.findByText(/cannot transition/i)).toBeTruthy();
    await waitFor(() => expect(listAlertEvents).toHaveBeenCalledTimes(2));
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AlertEvent } from "../lib/api/alerts";
import type { Service } from "../lib/api/services";
import { DashboardPage } from "./DashboardPage";

vi.mock("../lib/org-context", () => ({
  useOrg: vi.fn(),
}));
vi.mock("../lib/api/services", () => ({
  listServices: vi.fn(),
}));
vi.mock("../lib/api/incidents", () => ({
  listIncidents: vi.fn(),
}));
vi.mock("../lib/api/alerts", () => ({
  listAlertEvents: vi.fn(),
}));

import { listAlertEvents } from "../lib/api/alerts";
import { listIncidents } from "../lib/api/incidents";
import { listServices } from "../lib/api/services";
import { useOrg } from "../lib/org-context";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockOrg(selectedOrgId: string | null) {
  vi.mocked(useOrg).mockReturnValue({
    orgs: selectedOrgId ? [{ id: selectedOrgId, name: "Acme" }] : [],
    selectedOrgId,
    selectOrg: vi.fn(),
    createOrg: vi.fn(),
    isLoading: false,
  });
}

function makeService(overrides: { id: string } & Partial<Service>): Service {
  return {
    org_id: "org-1",
    name: overrides.id,
    slug: overrides.id,
    description: null,
    status: "unknown",
    repository_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeEvent(overrides: { id: string } & Partial<AlertEvent>): AlertEvent {
  return {
    org_id: "org-1",
    service_id: "svc-1",
    rule_id: null,
    severity: "info",
    title: `Event ${overrides.id}`,
    message: null,
    alert_status: "open",
    acknowledged_at: null,
    resolved_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders the service count and open incident count from the API", async () => {
    mockOrg("org-1");
    vi.mocked(listServices).mockResolvedValue({
      items: [makeService({ id: "svc-1" })],
      total: 7,
      limit: 100,
      offset: 0,
    });
    vi.mocked(listIncidents).mockResolvedValue({
      items: [],
      total: 3,
      limit: 1,
      offset: 0,
    });
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderPage();

    expect(await screen.findByText("7")).toBeTruthy();
    // All 4 non-resolved statuses resolve to total: 3 each, so the summed
    // open incident count is 12, not the literal `status: "open"` total.
    expect(screen.getByText("12")).toBeTruthy();
    for (const status of ["open", "investigating", "identified", "monitoring"]) {
      expect(listIncidents).toHaveBeenCalledWith(
        "org-1",
        { status },
        { limit: 1, offset: 0 },
      );
    }
    expect(listIncidents).not.toHaveBeenCalledWith(
      "org-1",
      { status: "resolved" },
      { limit: 1, offset: 0 },
    );
  });

  test("sums open incident count across non-resolved statuses, not just literal 'open'", async () => {
    mockOrg("org-1");
    vi.mocked(listServices).mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    vi.mocked(listIncidents).mockImplementation((_orgId, filters) => {
      const totals: Record<string, number> = {
        open: 0,
        investigating: 5,
        identified: 0,
        monitoring: 2,
      };
      return Promise.resolve({
        items: [],
        total: totals[filters.status as string] ?? 0,
        limit: 1,
        offset: 0,
      });
    });
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderPage();

    // Incidents split across investigating (5) + monitoring (2) should both
    // count toward the dashboard's open incident number, even though none
    // are literally `status: "open"`.
    expect(await screen.findByText("7")).toBeTruthy();
  });

  test("merges and sorts alert events from multiple services by timestamp, newest first", async () => {
    mockOrg("org-1");
    vi.mocked(listServices).mockResolvedValue({
      items: [makeService({ id: "svc-1" }), makeService({ id: "svc-2" })],
      total: 2,
      limit: 100,
      offset: 0,
    });
    vi.mocked(listIncidents).mockResolvedValue({ items: [], total: 0, limit: 1, offset: 0 });

    vi.mocked(listAlertEvents).mockImplementation((_orgId, serviceId) => {
      if (serviceId === "svc-1") {
        return Promise.resolve({
          items: [
            makeEvent({ id: "a-old", service_id: "svc-1", created_at: "2026-01-01T00:00:00Z" }),
            makeEvent({ id: "a-new", service_id: "svc-1", created_at: "2026-01-03T00:00:00Z" }),
          ],
          total: 2,
          limit: 20,
          offset: 0,
        });
      }
      return Promise.resolve({
        items: [
          makeEvent({ id: "b-mid", service_id: "svc-2", created_at: "2026-01-02T00:00:00Z" }),
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });
    });

    renderPage();

    const items = await screen.findAllByTestId("recent-alert-event");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Event a-new"),
      expect.stringContaining("Event b-mid"),
      expect.stringContaining("Event a-old"),
    ]);
  });

  test("shows a Create organization prompt instead of fetching anything when there is no selected org", () => {
    mockOrg(null);

    renderPage();

    expect(screen.getByText(/create organization/i)).toBeTruthy();
    expect(listServices).not.toHaveBeenCalled();
    expect(listIncidents).not.toHaveBeenCalled();
    expect(listAlertEvents).not.toHaveBeenCalled();
  });

  test("counts unresolved alert events across services, excluding resolved ones", async () => {
    mockOrg("org-1");
    vi.mocked(listServices).mockResolvedValue({
      items: [makeService({ id: "svc-1" })],
      total: 1,
      limit: 100,
      offset: 0,
    });
    vi.mocked(listIncidents).mockResolvedValue({ items: [], total: 0, limit: 1, offset: 0 });
    vi.mocked(listAlertEvents).mockResolvedValue({
      items: [
        makeEvent({ id: "e1", alert_status: "open" }),
        makeEvent({ id: "e2", alert_status: "acknowledged" }),
        makeEvent({ id: "e3", alert_status: "resolved" }),
      ],
      total: 3,
      limit: 20,
      offset: 0,
    });

    renderPage();

    expect((await screen.findByTestId("unresolved-alert-count")).textContent).toBe("2");
  });
});

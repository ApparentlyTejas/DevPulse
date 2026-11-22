import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { Service } from "../lib/api/services";
import { ServiceDetailPage } from "./ServiceDetailPage";

vi.mock("../lib/org-context", () => ({
  useOrg: vi.fn(),
}));
vi.mock("../lib/api/services", () => ({
  getService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));
vi.mock("../lib/api/alerts", () => ({
  listAlertRules: vi.fn(),
  createAlertRule: vi.fn(),
  updateAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
  listAlertEvents: vi.fn(),
  updateAlertEventStatus: vi.fn(),
}));
vi.mock("../lib/api/metrics", () => ({
  listMetrics: vi.fn(),
  createMetric: vi.fn(),
}));

import { useOrg } from "../lib/org-context";
import { deleteService, getService } from "../lib/api/services";
import { listAlertRules, listAlertEvents } from "../lib/api/alerts";
import { listMetrics } from "../lib/api/metrics";

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc-1",
    org_id: "org-1",
    name: "API",
    slug: "api",
    description: "The main API",
    status: "healthy",
    repository_url: "https://example.com/repo",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function renderPage(path = "/services/svc-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/services" element={<div>Services list</div>} />
          <Route path="/services/:id" element={<ServiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ServiceDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrg).mockReturnValue({
      orgs: [{ id: "org-1", name: "Acme" }],
      selectedOrgId: "org-1",
      selectOrg: vi.fn(),
      createOrg: vi.fn(),
      error: null,
      retry: vi.fn(),
      isLoading: false,
    });
    vi.mocked(listAlertRules).mockResolvedValue([]);
    vi.mocked(listAlertEvents).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    vi.mocked(listMetrics).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
  });

  test("renders the service name and description in the Overview tab", async () => {
    vi.mocked(getService).mockResolvedValue(makeService());

    renderPage();

    expect(await screen.findByRole("heading", { name: "API" })).toBeTruthy();
    expect(screen.getByText("The main API")).toBeTruthy();
    expect(getService).toHaveBeenCalledWith("org-1", "svc-1");
  });

  test("shows a not-found state when getService 404s", async () => {
    vi.mocked(getService).mockRejectedValue(new ApiError(404, "Service not found"));

    renderPage();

    expect(await screen.findByText(/could not be found/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "API" })).toBeNull();
  });

  test("shows a generic error state with retry for non-404 failures", async () => {
    vi.mocked(getService).mockRejectedValueOnce(new ApiError(500, "boom"));
    vi.mocked(getService).mockResolvedValueOnce(makeService());

    renderPage();

    expect(await screen.findByText(/failed to load this service/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByRole("heading", { name: "API" })).toBeTruthy();
  });

  test("renders all four tabs, each showing real content", async () => {
    vi.mocked(getService).mockResolvedValue(makeService());

    renderPage();

    expect(await screen.findByRole("heading", { name: "API" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Alert Rules" }));
    expect(await screen.findByText(/no alert rules yet/i)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Alert Events" }));
    expect(await screen.findByText(/no alert events yet/i)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Metrics" }));
    expect(await screen.findByText(/no metric snapshots yet/i)).toBeTruthy();
  });

  test("marks the selected tab active via data-active (not the unsupported data-selected)", async () => {
    vi.mocked(getService).mockResolvedValue(makeService());

    renderPage();

    const overviewTab = await screen.findByRole("tab", { name: "Overview" });
    expect(overviewTab.getAttribute("data-active")).not.toBeNull();
    expect(overviewTab.className).toContain("data-[active]:text-accent-orange");

    const user = userEvent.setup();
    const alertRulesTab = screen.getByRole("tab", { name: "Alert Rules" });
    await user.click(alertRulesTab);

    await waitFor(() => expect(alertRulesTab.getAttribute("data-active")).not.toBeNull());
    expect(overviewTab.getAttribute("data-active")).toBeNull();
  });

  test("shows a 404 error and refetches when deleting an already-gone service", async () => {
    vi.mocked(getService).mockResolvedValueOnce(makeService());
    vi.mocked(deleteService).mockRejectedValue(new ApiError(404, "Service not found"));
    vi.mocked(getService).mockRejectedValueOnce(new ApiError(404, "Service not found"));

    renderPage();

    expect(await screen.findByRole("heading", { name: "API" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));

    // The error handler sets an action error and refetches; the refetch's
    // 404 then switches the page to its not-found view (which replaces the
    // action-error paragraph), same as `IncidentDetailPage`'s equivalent --
    // so the end state to assert is the not-found view, not a surviving
    // action-error message.
    await waitFor(() => expect(getService).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/could not be found/i)).toBeTruthy();
  });

  test("deleting the service navigates back to the services list", async () => {
    vi.mocked(getService).mockResolvedValue(makeService());
    vi.mocked(deleteService).mockResolvedValue(undefined);

    renderPage();

    expect(await screen.findByRole("heading", { name: "API" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deleteService).toHaveBeenCalledWith("org-1", "svc-1"));
    expect(await screen.findByText("Services list")).toBeTruthy();
  });
});

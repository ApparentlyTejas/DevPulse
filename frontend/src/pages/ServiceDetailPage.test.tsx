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

import { useOrg } from "../lib/org-context";
import { deleteService, getService } from "../lib/api/services";
import { listAlertRules, listAlertEvents } from "../lib/api/alerts";

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
      isLoading: false,
    });
    vi.mocked(listAlertRules).mockResolvedValue([]);
    vi.mocked(listAlertEvents).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
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

  test("renders all four tabs, with Alert Rules/Events showing real content and Metrics a placeholder", async () => {
    vi.mocked(getService).mockResolvedValue(makeService());

    renderPage();

    expect(await screen.findByRole("heading", { name: "API" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Alert Rules" }));
    expect(await screen.findByText(/no alert rules yet/i)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Alert Events" }));
    expect(await screen.findByText(/no alert events yet/i)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Metrics" }));
    expect(await screen.findByText("Coming soon.")).toBeTruthy();
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

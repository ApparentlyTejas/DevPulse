import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { Incident } from "../lib/api/incidents";
import { IncidentDetailPage } from "./IncidentDetailPage";

vi.mock("../lib/org-context", () => ({
  useOrg: vi.fn(),
}));
vi.mock("../lib/api/incidents", () => ({
  getIncident: vi.fn(),
  updateIncidentStatus: vi.fn(),
}));
vi.mock("../lib/api/ai", () => ({
  listTriages: vi.fn(),
  runTriage: vi.fn(),
  listPostmortems: vi.fn(),
  generatePostmortem: vi.fn(),
}));

import { useOrg } from "../lib/org-context";
import { getIncident, updateIncidentStatus } from "../lib/api/incidents";
import { listTriages, listPostmortems } from "../lib/api/ai";

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "incident-1",
    org_id: "org-1",
    service_id: "svc-1",
    created_by: "user-1",
    title: "Database outage",
    description: "The primary database is unreachable.",
    severity: "sev1",
    incident_status: "open",
    resolved_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderPage(path = "/incidents/incident-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/incidents" element={<div>Incidents list</div>} />
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("IncidentDetailPage", () => {
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
    vi.mocked(listTriages).mockResolvedValue([]);
    vi.mocked(listPostmortems).mockResolvedValue([]);
  });

  test("renders the incident's title, severity, and status", async () => {
    vi.mocked(getIncident).mockResolvedValue(makeIncident());

    renderPage();

    expect(await screen.findByRole("heading", { name: "Database outage" })).toBeTruthy();
    expect(screen.getByText("sev1")).toBeTruthy();
    expect(screen.getByText("open")).toBeTruthy();
    expect(getIncident).toHaveBeenCalledWith("org-1", "incident-1");
  });

  test("changing the status control calls updateIncidentStatus and reflects the new status", async () => {
    vi.mocked(getIncident).mockResolvedValueOnce(makeIncident({ incident_status: "open" }));
    vi.mocked(getIncident).mockResolvedValueOnce(
      makeIncident({ incident_status: "investigating" }),
    );
    vi.mocked(updateIncidentStatus).mockResolvedValue(
      makeIncident({ incident_status: "investigating" }),
    );

    renderPage();
    expect(await screen.findByRole("heading", { name: "Database outage" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /start investigating/i }));

    await waitFor(() =>
      expect(updateIncidentStatus).toHaveBeenCalledWith("org-1", "incident-1", "investigating"),
    );
    expect(await screen.findByText("investigating")).toBeTruthy();
  });

  test("an open incident only offers its valid next transitions, not a free choice", async () => {
    vi.mocked(getIncident).mockResolvedValue(makeIncident({ incident_status: "open" }));

    renderPage();
    expect(await screen.findByRole("heading", { name: "Database outage" })).toBeTruthy();

    expect(screen.getByRole("button", { name: /start investigating/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /mark identified/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /start monitoring/i })).toBeNull();
  });

  test("a resolved incident shows no status actions (terminal state)", async () => {
    vi.mocked(getIncident).mockResolvedValue(makeIncident({ incident_status: "resolved" }));

    renderPage();
    expect(await screen.findByRole("heading", { name: "Database outage" })).toBeTruthy();

    expect(screen.queryByRole("button", { name: /resolve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /start investigating/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mark identified/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /start monitoring/i })).toBeNull();
  });

  test("shows an invalid-transition error from the API without crashing the page", async () => {
    vi.mocked(getIncident).mockResolvedValue(makeIncident({ incident_status: "open" }));
    vi.mocked(updateIncidentStatus).mockRejectedValue(
      new ApiError(422, "Cannot transition from open to monitoring"),
    );

    renderPage();
    expect(await screen.findByRole("heading", { name: "Database outage" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /start investigating/i }));

    expect(await screen.findByText(/cannot transition/i)).toBeTruthy();
    // The page is still usable -- the heading and facts rail are intact.
    expect(screen.getByRole("heading", { name: "Database outage" })).toBeTruthy();
  });

  test("shows a not-found state when getIncident 404s", async () => {
    vi.mocked(getIncident).mockRejectedValue(new ApiError(404, "Incident not found"));

    renderPage();

    expect(await screen.findByText(/could not be found/i)).toBeTruthy();
  });
});

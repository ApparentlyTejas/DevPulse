import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { Incident } from "../lib/api/incidents";
import { IncidentsListPage } from "./IncidentsListPage";

vi.mock("../lib/org-context", () => ({
  useOrg: vi.fn(),
}));
vi.mock("../lib/api/incidents", () => ({
  listIncidents: vi.fn(),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  deleteIncident: vi.fn(),
}));
vi.mock("../lib/api/services", () => ({
  listServices: vi.fn(),
}));

import { useOrg } from "../lib/org-context";
import {
  deleteIncident,
  listIncidents,
  updateIncident,
} from "../lib/api/incidents";
import { listServices } from "../lib/api/services";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IncidentsListPage />
    </QueryClientProvider>,
  );
}

function makeIncident(
  overrides: { id: string; title: string; severity: Incident["severity"] } & Partial<Incident>,
): Incident {
  return {
    org_id: "org-1",
    service_id: null,
    created_by: null,
    description: null,
    incident_status: "open",
    resolved_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockPage(
  items: ({ id: string; title: string; severity: Incident["severity"] } & Partial<Incident>)[],
) {
  return { items: items.map(makeIncident), total: items.length, limit: 20, offset: 0 };
}

describe("IncidentsListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrg).mockReturnValue({
      orgs: [{ id: "org-1", name: "Acme" }],
      selectedOrgId: "org-1",
      selectOrg: vi.fn(),
      createOrg: vi.fn(),
      isLoading: false,
    });
    vi.mocked(listServices).mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  });

  test("renders a row per incident with the correct severity dot color", async () => {
    vi.mocked(listIncidents).mockResolvedValue(
      mockPage([
        { id: "inc-1", title: "DB down", severity: "sev1" },
        { id: "inc-2", title: "Slow queries", severity: "sev4" },
      ]),
    );

    renderPage();

    expect(await screen.findByText("DB down")).toBeTruthy();
    const sev1Dot = screen.getByTestId("severity-dot-inc-1");
    expect(sev1Dot.className).toContain("bg-critical");

    const sev4Dot = screen.getByTestId("severity-dot-inc-2");
    expect(sev4Dot.className).toContain("bg-ink/40");
    expect(sev4Dot.className).not.toContain("bg-critical");
    expect(sev4Dot.className).not.toContain("bg-accent-orange");
    expect(sev4Dot.className).not.toContain("bg-accent-blue");
  });

  test("re-fetches with the chosen status in the query params when the status filter changes", async () => {
    vi.mocked(listIncidents).mockResolvedValue(
      mockPage([{ id: "inc-1", title: "DB down", severity: "sev1" }]),
    );

    renderPage();

    expect(await screen.findByText("DB down")).toBeTruthy();
    expect(listIncidents).toHaveBeenCalledWith("org-1", {}, { limit: 20, offset: 0 });

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: /status/i }));
    await user.click(await screen.findByRole("option", { name: /^resolved$/i }));

    await waitFor(() =>
      expect(listIncidents).toHaveBeenCalledWith(
        "org-1",
        { status: "resolved" },
        { limit: 20, offset: 0 },
      ),
    );
  });

  test("shows the empty state (not a broken pagination footer) when a filter combination has zero matches", async () => {
    vi.mocked(listIncidents).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderPage();

    expect(await screen.findByText(/no incidents yet/i)).toBeTruthy();
    expect(screen.queryByText(/showing/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("removes an incident from the list after a successful delete", async () => {
    vi.mocked(listIncidents).mockResolvedValueOnce(
      mockPage([{ id: "inc-1", title: "DB down", severity: "sev1" }]),
    );
    vi.mocked(deleteIncident).mockResolvedValue(undefined);
    vi.mocked(listIncidents).mockResolvedValueOnce({ items: [], total: 0, limit: 20, offset: 0 });

    renderPage();

    expect(await screen.findByText("DB down")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deleteIncident).toHaveBeenCalledWith("org-1", "inc-1"));
    expect(await screen.findByText(/no incidents yet/i)).toBeTruthy();
  });

  test("shows an error state and a retry action when the request fails", async () => {
    vi.mocked(listIncidents).mockRejectedValueOnce(new ApiError(500, "boom"));
    vi.mocked(listIncidents).mockResolvedValueOnce(
      mockPage([{ id: "inc-1", title: "DB down", severity: "sev1" }]),
    );

    renderPage();

    expect(await screen.findByText(/failed to load incidents/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("DB down")).toBeTruthy();
  });

  test("editing an incident sends the updated fields without service_id", async () => {
    vi.mocked(listIncidents).mockResolvedValue(
      mockPage([{ id: "inc-1", title: "DB down", severity: "sev1" }]),
    );
    vi.mocked(updateIncident).mockResolvedValue(
      makeIncident({ id: "inc-1", title: "DB down v2", severity: "sev2" }),
    );

    renderPage();

    expect(await screen.findByText("DB down")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /edit/i }));

    const titleInput = await screen.findByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, "DB down v2");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateIncident).toHaveBeenCalled());
    const [, , body] = vi.mocked(updateIncident).mock.calls[0];
    expect(body).toMatchObject({ title: "DB down v2" });
    expect(body).not.toHaveProperty("service_id");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { Service } from "../lib/api/services";
import { ServicesListPage } from "./ServicesListPage";

vi.mock("../lib/org-context", () => ({
  useOrg: vi.fn(),
}));
vi.mock("../lib/api/services", () => ({
  listServices: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));

import { useOrg } from "../lib/org-context";
import { deleteService, listServices, updateService } from "../lib/api/services";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ServicesListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockOrg(selectedOrgId: string) {
  vi.mocked(useOrg).mockReturnValue({
    orgs: [{ id: selectedOrgId, name: "Acme" }],
    selectedOrgId,
    selectOrg: vi.fn(),
    createOrg: vi.fn(),
    error: null,
    retry: vi.fn(),
    isLoading: false,
  });
}

// `Service` now carries the full backend record; these tests only care
// about `id`/`name`/`description`, so fill the rest with defaults.
function makeService(
  overrides: { id: string; name: string; description: string | null } & Partial<Service>,
): Service {
  return {
    org_id: "org-1",
    slug: overrides.id,
    status: "unknown",
    repository_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockPage(items: ({ id: string; name: string; description: string | null } & Partial<Service>)[]) {
  return { items: items.map(makeService), total: items.length, limit: 20, offset: 0 };
}

describe("ServicesListPage", () => {
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
  });

  test("renders a row per service returned by the API", async () => {
    vi.mocked(listServices).mockResolvedValue(
      mockPage([
        { id: "svc-1", name: "API", description: "The main API" },
        { id: "svc-2", name: "Worker", description: null },
      ]),
    );

    renderPage();

    expect(await screen.findByText("API")).toBeTruthy();
    expect(screen.getByText("The main API")).toBeTruthy();
    expect(screen.getByText("Worker")).toBeTruthy();
    expect(listServices).toHaveBeenCalledWith("org-1", { limit: 20, offset: 0 });
  });

  test("renders the service name as a link to its detail page", async () => {
    vi.mocked(listServices).mockResolvedValue(
      mockPage([{ id: "svc-1", name: "API", description: "The main API" }]),
    );

    renderPage();

    const nameLink = await screen.findByRole("link", { name: "API" });
    expect(nameLink.getAttribute("href")).toBe("/services/svc-1");
  });

  test("shows the empty state when total is 0", async () => {
    vi.mocked(listServices).mockResolvedValue(mockPage([]));

    renderPage();

    expect(await screen.findByText(/no services yet/i)).toBeTruthy();
  });

  test("shows an error state and a retry action when the request fails", async () => {
    vi.mocked(listServices).mockRejectedValueOnce(new ApiError(500, "boom"));
    vi.mocked(listServices).mockResolvedValueOnce(
      mockPage([{ id: "svc-1", name: "API", description: null }]),
    );

    renderPage();

    expect(await screen.findByText(/failed to load services/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("API")).toBeTruthy();
  });

  test("removes a service from the list after a successful delete", async () => {
    vi.mocked(listServices).mockResolvedValueOnce(
      mockPage([{ id: "svc-1", name: "API", description: null }]),
    );
    vi.mocked(deleteService).mockResolvedValue(undefined);
    vi.mocked(listServices).mockResolvedValueOnce(mockPage([]));

    renderPage();

    expect(await screen.findByText("API")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deleteService).toHaveBeenCalledWith("org-1", "svc-1"));
    expect(await screen.findByText(/no services yet/i)).toBeTruthy();
  });

  test("shows a 404 error and refetches the list when deleting an already-gone service", async () => {
    vi.mocked(listServices).mockResolvedValueOnce(
      mockPage([{ id: "svc-1", name: "API", description: null }]),
    );
    vi.mocked(deleteService).mockRejectedValue(new ApiError(404, "Service not found"));
    vi.mocked(listServices).mockResolvedValueOnce(mockPage([]));

    renderPage();

    expect(await screen.findByText("API")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByText("Service not found")).toBeTruthy();
    await waitFor(() => expect(listServices).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no services yet/i)).toBeTruthy();
  });

  test("editing a service without touching status does not send status in the update", async () => {
    vi.mocked(listServices).mockResolvedValue(
      mockPage([{ id: "svc-1", name: "API", description: "The main API" }]),
    );
    vi.mocked(updateService).mockResolvedValue(
      makeService({ id: "svc-1", name: "API v2", description: "The main API" }),
    );

    renderPage();

    expect(await screen.findByText("API")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /edit/i }));

    const nameInput = await screen.findByLabelText(/name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "API v2");
    // Deliberately leave the Status field untouched.
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateService).toHaveBeenCalled());
    const [, , body] = vi.mocked(updateService).mock.calls[0];
    // `status: undefined` (rather than the hardcoded "unknown" the edit
    // form was seeded with) is what makes `JSON.stringify` drop the key
    // from the actual PATCH body sent over the wire.
    expect(body.status).toBeUndefined();
  });

  test("resets pagination to the first page when the selected org changes", async () => {
    vi.mocked(listServices).mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) =>
        makeService({ id: `svc-${i}`, name: `Service ${i}`, description: null }),
      ),
      total: 50,
      limit: 20,
      offset: 0,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ServicesListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Service 0")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(listServices).toHaveBeenCalledWith("org-1", { limit: 20, offset: 20 }),
    );

    mockOrg("org-2");
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ServicesListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(listServices).toHaveBeenCalledWith("org-2", { limit: 20, offset: 0 }),
    );
  });

  test("invalidates the list on a 404 edit (not just on success), so the row drops after Cancel", async () => {
    vi.mocked(listServices).mockResolvedValueOnce(
      mockPage([{ id: "svc-1", name: "API", description: null }]),
    );
    vi.mocked(updateService).mockRejectedValue(new ApiError(404, "Service not found"));
    vi.mocked(listServices).mockResolvedValueOnce(mockPage([]));

    renderPage();

    expect(await screen.findByText("API")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    // The mutation's `onSettled` invalidation fires on this failed submit,
    // not only on a later success -- the list refetch (and the row
    // dropping) doesn't wait for Cancel.
    await waitFor(() => expect(listServices).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(await screen.findByText(/no services yet/i)).toBeTruthy();
  });

  test("steps pagination back a page after deleting the only row on page 2", async () => {
    vi.mocked(listServices).mockResolvedValueOnce({
      items: Array.from({ length: 20 }, (_, i) =>
        makeService({ id: `svc-${i}`, name: `Service ${i}`, description: null }),
      ),
      total: 21,
      limit: 20,
      offset: 0,
    });
    vi.mocked(listServices).mockResolvedValueOnce(
      mockPage([{ id: "svc-last", name: "Last one", description: null }]),
    );

    renderPage();

    expect(await screen.findByText("Service 0")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText("Last one")).toBeTruthy();

    vi.mocked(deleteService).mockResolvedValue(undefined);
    // After the delete, the offset-20 query returns an empty page with
    // total 0 (the deletion's own invalidation refetch); the component
    // should step `offset` back to 0 and land on a real page, not an
    // empty table under a "Showing 21-20 of 20" footer.
    vi.mocked(listServices).mockResolvedValue(mockPage([]));

    await user.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() =>
      expect(listServices).toHaveBeenCalledWith("org-1", { limit: 20, offset: 0 }),
    );
    expect(screen.queryByText(/showing 21-20/i)).toBeNull();
  });
});

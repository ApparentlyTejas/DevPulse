import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AppLayout } from "./AppLayout";

vi.mock("../lib/auth-context", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../lib/org-context", () => ({
  useOrg: vi.fn(),
}));

import { useAuth } from "../lib/auth-context";
import { useOrg } from "../lib/org-context";

function baseOrgMock() {
  return {
    orgs: [] as { id: string; name: string }[],
    selectedOrgId: null as string | null,
    selectOrg: vi.fn(),
    createOrg: vi.fn(),
    isLoading: false,
    error: null as string | null,
    retry: vi.fn(),
  };
}

function renderAppLayout(queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div>Dashboard Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects to /login when there is no authenticated user", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);
    vi.mocked(useOrg).mockReturnValue(baseOrgMock());

    renderAppLayout();

    expect(screen.getByText("Login Page")).toBeTruthy();
    expect(screen.queryByText("Dashboard Content")).toBeNull();
  });

  test("shows a Create organization prompt when the org list is empty", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue(baseOrgMock());

    renderAppLayout();

    expect(screen.getByRole("heading", { name: /create organization/i })).toBeTruthy();
    expect(screen.queryByText("Dashboard Content")).toBeNull();
    expect(screen.queryByText("Login Page")).toBeNull();
  });

  test("shows a distinct error-with-retry view instead of the create-org prompt when the org load failed", () => {
    const retry = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      ...baseOrgMock(),
      error: "Something went wrong. Please try again.",
      retry,
    });

    renderAppLayout();

    expect(screen.queryByRole("heading", { name: /create organization/i })).toBeNull();
    expect(screen.getByText(/couldn't load your organizations/i)).toBeTruthy();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();

    screen.getByRole("button", { name: /retry/i }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test("lists orgs in the switcher and calls selectOrg on choosing one", async () => {
    const selectOrg = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      ...baseOrgMock(),
      orgs: [
        { id: "org-1", name: "Acme" },
        { id: "org-2", name: "Globex" },
      ],
      selectedOrgId: "org-1",
      selectOrg,
    });

    renderAppLayout();

    expect(screen.getByText("Dashboard Content")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /organization/i }).textContent).toContain("Acme");

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: /organization/i }));
    await user.click(await screen.findByRole("option", { name: "Globex" }));

    expect(selectOrg).toHaveBeenCalledWith("org-2");
  });

  test("does not render both the create-org prompt and the outlet at once", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      ...baseOrgMock(),
      orgs: [{ id: "org-1", name: "Acme" }],
      selectedOrgId: "org-1",
    });

    renderAppLayout();

    expect(screen.getByText("Dashboard Content")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /create organization/i })).toBeNull();
  });

  test("renders primary nav links to the dashboard, services, incidents, and members", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      ...baseOrgMock(),
      orgs: [{ id: "org-1", name: "Acme" }],
      selectedOrgId: "org-1",
    });

    renderAppLayout();

    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Services" }).getAttribute("href")).toBe("/services");
    expect(screen.getByRole("link", { name: "Incidents" }).getAttribute("href")).toBe(
      "/incidents",
    );
    expect(screen.getByRole("link", { name: "Members" }).getAttribute("href")).toBe("/members");
  });

  test("marks the active nav link with the accent-orange active-state class", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      ...baseOrgMock(),
      orgs: [{ id: "org-1", name: "Acme" }],
      selectedOrgId: "org-1",
    });

    renderAppLayout();

    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    const servicesLink = screen.getByRole("link", { name: "Services" });
    expect(dashboardLink.className).toContain("text-accent-orange");
    expect(servicesLink.className).not.toContain("text-accent-orange");
  });

  test("logging out calls useAuth().logout and clears the query client", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "1", email: "a@b.com" },
      logout,
    } as never);
    vi.mocked(useOrg).mockReturnValue({
      ...baseOrgMock(),
      orgs: [{ id: "org-1", name: "Acme" }],
      selectedOrgId: "org-1",
    });

    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, "clear");

    renderAppLayout(queryClient);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});

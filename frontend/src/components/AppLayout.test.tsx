import { render, screen } from "@testing-library/react";
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

function renderAppLayout() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/" element={<AppLayout />}>
          <Route index element={<div>Dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects to /login when there is no authenticated user", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never);
    vi.mocked(useOrg).mockReturnValue({
      orgs: [],
      selectedOrgId: null,
      selectOrg: vi.fn(),
      createOrg: vi.fn(),
      isLoading: false,
    });

    renderAppLayout();

    expect(screen.getByText("Login Page")).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  test("shows a Create organization prompt when the org list is empty", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      orgs: [],
      selectedOrgId: null,
      selectOrg: vi.fn(),
      createOrg: vi.fn(),
      isLoading: false,
    });

    renderAppLayout();

    expect(screen.getByRole("heading", { name: /create organization/i })).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByText("Login Page")).toBeNull();
  });

  test("lists orgs in the switcher and calls selectOrg on choosing one", async () => {
    const selectOrg = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      orgs: [
        { id: "org-1", name: "Acme" },
        { id: "org-2", name: "Globex" },
      ],
      selectedOrgId: "org-1",
      selectOrg,
      createOrg: vi.fn(),
      isLoading: false,
    });

    renderAppLayout();

    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /organization/i }).textContent).toContain("Acme");

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: /organization/i }));
    await user.click(await screen.findByRole("option", { name: "Globex" }));

    expect(selectOrg).toHaveBeenCalledWith("org-2");
  });

  test("does not render both the create-org prompt and the outlet at once", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", email: "a@b.com" } } as never);
    vi.mocked(useOrg).mockReturnValue({
      orgs: [{ id: "org-1", name: "Acme" }],
      selectedOrgId: "org-1",
      selectOrg: vi.fn(),
      createOrg: vi.fn(),
      isLoading: false,
    });

    renderAppLayout();

    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /create organization/i })).toBeNull();
  });
});

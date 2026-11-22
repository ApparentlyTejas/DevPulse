import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { Member } from "../lib/api/organizations";
import { MembersPage } from "./MembersPage";

vi.mock("../lib/org-context", () => ({
  useOrg: vi.fn(),
}));
vi.mock("../lib/api/organizations", async () => {
  const actual = await vi.importActual<typeof import("../lib/api/organizations")>(
    "../lib/api/organizations",
  );
  return {
    ...actual,
    listMembers: vi.fn(),
    addMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  };
});

import { useOrg } from "../lib/org-context";
import {
  addMember,
  listMembers,
  removeMember,
  updateMemberRole,
} from "../lib/api/organizations";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeMember(overrides: Partial<Member> & { id: string }): Member {
  return {
    userId: overrides.id,
    email: "user@example.com",
    fullName: "Jane Doe",
    role: "member",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("MembersPage", () => {
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

  test("renders a row per member returned by the API", async () => {
    vi.mocked(listMembers).mockResolvedValue([
      makeMember({ id: "mem-1", userId: "user-1", fullName: "Jane Doe", email: "jane@acme.com" }),
      makeMember({ id: "mem-2", userId: "user-2", fullName: "Bob Smith", email: "bob@acme.com" }),
    ]);

    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("Bob Smith")).toBeTruthy();
    expect(screen.getByText("user-1")).toBeTruthy();
    expect(listMembers).toHaveBeenCalledWith("org-1");
  });

  test("falls back to email when a member has no full name", async () => {
    vi.mocked(listMembers).mockResolvedValue([
      makeMember({ id: "mem-1", userId: "user-1", fullName: null, email: "jane@acme.com" }),
    ]);

    renderPage();

    expect(await screen.findByText("jane@acme.com")).toBeTruthy();
  });

  test("does not call listMembers when no org is selected", () => {
    vi.mocked(useOrg).mockReturnValue({
      orgs: [],
      selectedOrgId: null,
      selectOrg: vi.fn(),
      createOrg: vi.fn(),
      error: null,
      retry: vi.fn(),
      isLoading: false,
    });

    renderPage();

    expect(listMembers).not.toHaveBeenCalled();
    expect(screen.getByText(/select an organization/i)).toBeTruthy();
  });

  test("adding a member by user ID adds a row to the list", async () => {
    vi.mocked(listMembers).mockResolvedValueOnce([]);
    vi.mocked(addMember).mockResolvedValue(
      makeMember({ id: "mem-3", userId: "user-3", fullName: "New Person", email: "new@acme.com" }),
    );
    vi.mocked(listMembers).mockResolvedValueOnce([
      makeMember({ id: "mem-3", userId: "user-3", fullName: "New Person", email: "new@acme.com" }),
    ]);

    renderPage();

    expect(await screen.findByText(/no members yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/user id/i), "user-3");
    await user.click(screen.getByRole("button", { name: /add member/i }));

    await waitFor(() => expect(addMember).toHaveBeenCalledWith("org-1", "user-3"));
    expect(await screen.findByText("New Person")).toBeTruthy();
  });

  test("shows the backend error detail when adding a nonexistent user ID", async () => {
    vi.mocked(listMembers).mockResolvedValue([]);
    vi.mocked(addMember).mockRejectedValue(new ApiError(404, "User not found"));

    renderPage();

    expect(await screen.findByText(/no members yet/i)).toBeTruthy();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/user id/i), "nonexistent-user");
    await user.click(screen.getByRole("button", { name: /add member/i }));

    expect(await screen.findByText("User not found")).toBeTruthy();
  });

  test("changing a member's role calls updateMemberRole with the new role", async () => {
    vi.mocked(listMembers).mockResolvedValue([
      makeMember({ id: "mem-1", userId: "user-1", fullName: "Jane Doe", role: "member" }),
    ]);
    vi.mocked(updateMemberRole).mockResolvedValue(
      makeMember({ id: "mem-1", userId: "user-1", fullName: "Jane Doe", role: "admin" }),
    );

    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: /role for jane doe/i }));
    await user.click(await screen.findByRole("option", { name: /^admin$/i }));

    await waitFor(() =>
      expect(updateMemberRole).toHaveBeenCalledWith("org-1", "user-1", "admin"),
    );
  });

  test("removing a member removes their row from the list", async () => {
    vi.mocked(listMembers).mockResolvedValueOnce([
      makeMember({ id: "mem-1", userId: "user-1", fullName: "Jane Doe" }),
    ]);
    vi.mocked(removeMember).mockResolvedValue(undefined);
    vi.mocked(listMembers).mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("org-1", "user-1"));
    expect(await screen.findByText(/no members yet/i)).toBeTruthy();
  });

  test("shows a 404 error and refetches the list when removing an already-gone member", async () => {
    vi.mocked(listMembers).mockResolvedValueOnce([
      makeMember({ id: "mem-1", userId: "user-1", fullName: "Jane Doe" }),
    ]);
    vi.mocked(removeMember).mockRejectedValue(new ApiError(404, "Member not found"));
    vi.mocked(listMembers).mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(await screen.findByText("Member not found")).toBeTruthy();
    await waitFor(() => expect(listMembers).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/no members yet/i)).toBeTruthy();
  });
});

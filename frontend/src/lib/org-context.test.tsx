import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "./api/client";
import { OrgProvider, useOrg } from "./org-context";

const SELECTED_ORG_ID_KEY = "devpulse_selected_org_id";

vi.mock("./auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "user@example.com" } }),
}));

vi.mock("./api/organizations", () => ({
  listOrganizations: vi.fn(),
  createOrganization: vi.fn(),
}));

import { createOrganization, listOrganizations } from "./api/organizations";

function Probe() {
  const { orgs, selectedOrgId, selectOrg, createOrg, isLoading, error, retry } = useOrg();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="selected">{selectedOrgId ?? "none"}</span>
      <span data-testid="error">{error ?? "none"}</span>
      <ul>
        {orgs.map((o) => (
          <li key={o.id}>{o.name}</li>
        ))}
      </ul>
      <button onClick={() => selectOrg("org-2")}>select org-2</button>
      <button onClick={() => void createOrg("New Org")}>create</button>
      <button onClick={retry}>retry</button>
    </div>
  );
}

describe("OrgProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test("selectedOrgId is null when the org list is empty", async () => {
    vi.mocked(listOrganizations).mockResolvedValue([]);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("selected").textContent).toBe("none");
  });

  test("selectedOrgId defaults to the first org when orgs load", async () => {
    vi.mocked(listOrganizations).mockResolvedValue([
      { id: "org-1", name: "First" },
      { id: "org-2", name: "Second" },
    ]);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("org-1"));
  });

  test("createOrg adds the new org and selects it", async () => {
    vi.mocked(listOrganizations).mockResolvedValue([{ id: "org-1", name: "First" }]);
    vi.mocked(createOrganization).mockResolvedValue({ id: "org-3", name: "New Org" });

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("org-1"));

    await act(async () => {
      screen.getByText("create").click();
    });

    expect(createOrganization).toHaveBeenCalledWith("New Org");
    expect(screen.getByTestId("selected").textContent).toBe("org-3");
    expect(screen.getByText("New Org")).toBeTruthy();
  });

  test("selectOrg updates the selected id", async () => {
    vi.mocked(listOrganizations).mockResolvedValue([
      { id: "org-1", name: "First" },
      { id: "org-2", name: "Second" },
    ]);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("org-1"));

    await act(async () => {
      screen.getByText("select org-2").click();
    });

    expect(screen.getByTestId("selected").textContent).toBe("org-2");
  });

  test("does not load orgs when there is no authenticated user", async () => {
    const authModule = await import("./auth-context");
    const useAuthSpy = vi.spyOn(authModule, "useAuth").mockReturnValue({ user: null } as never);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(listOrganizations).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected").textContent).toBe("none");

    // This spy overrides the module-level `useAuth` mock above for every
    // subsequent test in this file unless restored -- every later test in
    // this suite expects an authenticated user.
    useAuthSpy.mockRestore();
  });

  test("sets an error (not an empty org list) when loading organizations fails", async () => {
    vi.mocked(listOrganizations).mockRejectedValue(new ApiError(500, "Internal server error"));

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("error").textContent).toBe("Internal server error");
    // Not "zero orgs": a real failure must not look like the empty-org
    // first-run state to the caller (`AppLayout` tells them apart via
    // `error`).
    expect(screen.getByTestId("selected").textContent).toBe("none");
  });

  test("retry re-attempts the load and clears the error on success", async () => {
    vi.mocked(listOrganizations)
      .mockRejectedValueOnce(new ApiError(500, "Internal server error"))
      .mockResolvedValueOnce([{ id: "org-1", name: "First" }]);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("error").textContent).not.toBe("none"));

    await act(async () => {
      screen.getByText("retry").click();
    });

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("org-1"));
    expect(screen.getByTestId("error").textContent).toBe("none");
    expect(listOrganizations).toHaveBeenCalledTimes(2);
  });

  test("persists the selected org to localStorage and restores it instead of defaulting to orgs[0]", async () => {
    localStorage.setItem(SELECTED_ORG_ID_KEY, "org-2");
    vi.mocked(listOrganizations).mockResolvedValue([
      { id: "org-1", name: "First" },
      { id: "org-2", name: "Second" },
    ]);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("org-2"));
  });

  test("falls back to orgs[0] when the persisted org id is no longer in the list", async () => {
    localStorage.setItem(SELECTED_ORG_ID_KEY, "org-gone");
    vi.mocked(listOrganizations).mockResolvedValue([
      { id: "org-1", name: "First" },
      { id: "org-2", name: "Second" },
    ]);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("org-1"));
    expect(localStorage.getItem(SELECTED_ORG_ID_KEY)).toBe("org-1");
  });

  test("selectOrg persists the new selection to localStorage", async () => {
    vi.mocked(listOrganizations).mockResolvedValue([
      { id: "org-1", name: "First" },
      { id: "org-2", name: "Second" },
    ]);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("org-1"));

    await act(async () => {
      screen.getByText("select org-2").click();
    });

    expect(localStorage.getItem(SELECTED_ORG_ID_KEY)).toBe("org-2");
  });
});

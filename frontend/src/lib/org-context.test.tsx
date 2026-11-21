import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { OrgProvider, useOrg } from "./org-context";

vi.mock("./auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "user@example.com" } }),
}));

vi.mock("./api/organizations", () => ({
  listOrganizations: vi.fn(),
  createOrganization: vi.fn(),
}));

import { createOrganization, listOrganizations } from "./api/organizations";

function Probe() {
  const { orgs, selectedOrgId, selectOrg, createOrg, isLoading } = useOrg();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="selected">{selectedOrgId ?? "none"}</span>
      <ul>
        {orgs.map((o) => (
          <li key={o.id}>{o.name}</li>
        ))}
      </ul>
      <button onClick={() => selectOrg("org-2")}>select org-2</button>
      <button onClick={() => void createOrg("New Org")}>create</button>
    </div>
  );
}

describe("OrgProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.spyOn(authModule, "useAuth").mockReturnValue({ user: null } as never);

    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(listOrganizations).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected").textContent).toBe("none");
  });
});

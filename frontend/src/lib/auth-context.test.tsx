import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";

const REFRESH_TOKEN_KEY = "devpulse_refresh_token";

vi.mock("./api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser, logout as apiLogout, refreshAccessToken } from "./api/auth";

function Probe() {
  const { user, isLoading, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  test("restores a session on mount when a refresh token is in localStorage", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "stored-refresh-token");
    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "rotated-refresh-token",
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "1", email: "user@example.com" });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("user@example.com");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  test("clears tokens and sets user to null on logout", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "stored-refresh-token");
    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "rotated-refresh-token",
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "1", email: "user@example.com" });
    vi.mocked(apiLogout).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("user@example.com"));

    await act(async () => {
      screen.getByText("logout").click();
    });

    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(apiLogout).toHaveBeenCalledTimes(1);
  });

  test("has no user and isLoading false when no refresh token is stored", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

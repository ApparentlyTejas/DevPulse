import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import { LoginPage } from "./LoginPage";

vi.mock("../lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../lib/auth-context";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls login with the entered email and password on submit", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      login,
      register: vi.fn(),
      logout: vi.fn(),
      user: null,
      accessToken: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("user@example.com", "password123"));
  });

  test("shows the backend's error detail on a failed login", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, "Invalid credentials"));
    vi.mocked(useAuth).mockReturnValue({
      login,
      register: vi.fn(),
      logout: vi.fn(),
      user: null,
      accessToken: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid credentials")).toBeTruthy();
  });

  test("shows a validation error for an invalid email without calling login", async () => {
    const login = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      login,
      register: vi.fn(),
      logout: vi.fn(),
      user: null,
      accessToken: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });
});

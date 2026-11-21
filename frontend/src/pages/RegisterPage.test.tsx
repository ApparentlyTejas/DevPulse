import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import { RegisterPage } from "./RegisterPage";

vi.mock("../lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../lib/auth-context";

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("calls register with the entered email and password on submit", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      register,
      logout: vi.fn(),
      user: null,
      accessToken: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("new@example.com", "password123"),
    );
  });

  test("shows the backend's error detail on a failed registration", async () => {
    const register = vi.fn().mockRejectedValue(new ApiError(409, "Email already registered"));
    vi.mocked(useAuth).mockReturnValue({
      login: vi.fn(),
      register,
      logout: vi.fn(),
      user: null,
      accessToken: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Email already registered")).toBeTruthy();
  });
});

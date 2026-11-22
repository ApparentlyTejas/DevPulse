import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { Postmortem } from "../lib/api/ai";
import { PostmortemPanel } from "./PostmortemPanel";

vi.mock("../lib/api/ai", () => ({
  listPostmortems: vi.fn(),
  generatePostmortem: vi.fn(),
}));

import { listPostmortems, generatePostmortem } from "../lib/api/ai";

function makePostmortem(overrides: Partial<Postmortem> = {}): Postmortem {
  return {
    id: "pm-1",
    incident_id: "inc-1",
    content: "## Summary\n\nSomething broke.\n\n- cause one\n- cause two",
    model: "claude-sonnet",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PostmortemPanel orgId="org-1" incidentId="inc-1" />
    </QueryClientProvider>,
  );
}

describe("PostmortemPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders the latest postmortem's content as formatted markdown, not raw text", async () => {
    vi.mocked(listPostmortems).mockResolvedValue([
      makePostmortem({
        id: "pm-1",
        content: "## Summary\n\nOlder postmortem.",
        created_at: "2026-01-01T00:00:00Z",
      }),
      makePostmortem({
        id: "pm-2",
        content: "## Summary\n\nNewer postmortem.",
        created_at: "2026-02-01T00:00:00Z",
      }),
    ]);

    renderPanel();

    const heading = await screen.findByRole("heading", { name: "Summary", level: 2 });
    expect(heading).toBeTruthy();
    expect(screen.getByText("Newer postmortem.")).toBeTruthy();
    expect(screen.queryByText("Older postmortem.")).toBeNull();
    expect(screen.queryByText(/## Summary/)).toBeNull();
  });

  test("shows an empty state when no postmortem has been generated yet", async () => {
    vi.mocked(listPostmortems).mockResolvedValue([]);

    renderPanel();

    expect(await screen.findByText(/no postmortem/i)).toBeTruthy();
  });

  test("generate adds a new postmortem and displays it", async () => {
    vi.mocked(listPostmortems).mockResolvedValue([
      makePostmortem({ id: "pm-1", content: "## Summary\n\nExisting postmortem." }),
    ]);
    vi.mocked(generatePostmortem).mockResolvedValue(
      makePostmortem({
        id: "pm-2",
        content: "## Summary\n\nFreshly generated postmortem.",
        created_at: "2026-03-01T00:00:00Z",
      }),
    );

    renderPanel();

    expect(await screen.findByText("Existing postmortem.")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate postmortem/i }));

    await waitFor(() =>
      expect(screen.getByText("Freshly generated postmortem.")).toBeTruthy(),
    );
  });

  test("shows the rate-limit message, with the Retry-After value, on a 429 from generatePostmortem", async () => {
    vi.mocked(listPostmortems).mockResolvedValue([]);
    vi.mocked(generatePostmortem).mockRejectedValue(new ApiError(429, "Rate limit exceeded", 42));

    renderPanel();

    await screen.findByText(/no postmortem/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate postmortem/i }));

    expect(await screen.findByText(/42/)).toBeTruthy();
    expect(screen.getByText(/try again/i)).toBeTruthy();
  });

  test("shows a distinct message for a 502 AI failure", async () => {
    vi.mocked(listPostmortems).mockResolvedValue([]);
    vi.mocked(generatePostmortem).mockRejectedValue(
      new ApiError(502, "Postmortem generation failed: upstream timeout"),
    );

    renderPanel();

    await screen.findByText(/no postmortem/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate postmortem/i }));

    expect(await screen.findByText(/postmortem generation failed/i)).toBeTruthy();
  });
});

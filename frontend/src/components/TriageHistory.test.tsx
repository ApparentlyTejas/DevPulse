import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import type { IncidentTriage } from "../lib/api/ai";
import { TriageHistory } from "./TriageHistory";

vi.mock("../lib/api/ai", () => ({
  listTriages: vi.fn(),
  runTriage: vi.fn(),
}));

import { listTriages, runTriage } from "../lib/api/ai";

function makeTriage(overrides: Partial<IncidentTriage> = {}): IncidentTriage {
  return {
    id: "triage-1",
    incident_id: "inc-1",
    summary: "Likely caused by a deploy regression.",
    suggested_severity: "sev2",
    confidence: 0.82,
    model: "claude-sonnet",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderHistory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TriageHistory orgId="org-1" incidentId="inc-1" />
    </QueryClientProvider>,
  );
}

describe("TriageHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders one timeline entry per past triage, newest first", async () => {
    vi.mocked(listTriages).mockResolvedValue([
      makeTriage({ id: "triage-1", summary: "Older triage", created_at: "2026-01-01T00:00:00Z" }),
      makeTriage({ id: "triage-2", summary: "Newer triage", created_at: "2026-01-02T00:00:00Z" }),
    ]);

    renderHistory();

    const entries = await screen.findAllByTestId("triage-entry");
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain("Newer triage");
    expect(entries[1].textContent).toContain("Older triage");
  });

  test("appends a new entry after a successful Run triage", async () => {
    vi.mocked(listTriages).mockResolvedValue([
      makeTriage({ id: "triage-1", summary: "Existing triage" }),
    ]);
    vi.mocked(runTriage).mockResolvedValue(
      makeTriage({
        id: "triage-2",
        summary: "Freshly run triage",
        created_at: "2026-02-01T00:00:00Z",
      }),
    );

    renderHistory();

    expect(await screen.findByText("Existing triage")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /run triage/i }));

    await waitFor(() => expect(screen.getByText("Freshly run triage")).toBeTruthy());

    const entries = screen.getAllByTestId("triage-entry");
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain("Freshly run triage");
  });

  test("shows the rate-limit message, with the Retry-After value, on a 429 from runTriage", async () => {
    vi.mocked(listTriages).mockResolvedValue([]);
    vi.mocked(runTriage).mockRejectedValue(
      new ApiError(429, "Rate limit exceeded", 42),
    );

    renderHistory();

    await screen.findByText(/no triage runs yet/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /run triage/i }));

    expect(await screen.findByText(/42/)).toBeTruthy();
    expect(screen.getByText(/try again/i)).toBeTruthy();
  });

  test("shows a distinct message for a 502 AI failure", async () => {
    vi.mocked(listTriages).mockResolvedValue([]);
    vi.mocked(runTriage).mockRejectedValue(
      new ApiError(502, "AI triage failed: upstream timeout"),
    );

    renderHistory();

    await screen.findByText(/no triage runs yet/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /run triage/i }));

    expect(await screen.findByText(/ai triage failed/i)).toBeTruthy();
  });
});

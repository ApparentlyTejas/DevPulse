import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiRequest, setTokenGetter, setUnauthorizedHandler } from "./client";

const REFRESH_TOKEN_KEY = "devpulse_refresh_token";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiRequest", () => {
  beforeEach(() => {
    localStorage.clear();
    setTokenGetter(() => null);
    setUnauthorizedHandler(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("attaches the Authorization header from the token getter", async () => {
    setTokenGetter(() => "abc123");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/foo");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  test("retries once after a successful refresh on 401", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "old-refresh-token");
    setTokenGetter(() => "expired-token");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
          expires_at: "2030-01-01T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ result: "success" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ result: string }>("/protected");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ result: "success" });
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe("new-refresh-token");

    const retryCallInit = fetchMock.mock.calls[2][1];
    const retryHeaders = new Headers(retryCallInit.headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer new-access-token");
  });

  test("throws ApiError with status and detail on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/missing")).rejects.toMatchObject({
      status: 404,
      detail: "not found",
    });
  });

  test("clears tokens via the unauthorized handler and does not retry forever when refresh also fails", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "old-refresh-token");
    setTokenGetter(() => "expired-token");
    const unauthorizedHandler = vi.fn();
    setUnauthorizedHandler(unauthorizedHandler);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: "invalid refresh token" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/protected")).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  test("populates retryAfterSeconds from a Retry-After header on a 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/organizations/org-1/incidents/inc-1/triage")).rejects.toMatchObject(
      {
        status: 429,
        detail: "Rate limit exceeded",
        retryAfterSeconds: 30,
      },
    );
  });

  test("leaves retryAfterSeconds undefined when there is no Retry-After header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/missing")).rejects.toMatchObject({
      status: 404,
      retryAfterSeconds: undefined,
    });
  });

  test("does not attempt a refresh on a non-401 error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: "boom" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/broken")).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("de-duplicates concurrent refreshes: two 401s at once only call /auth/refresh once", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "old-refresh-token");
    setTokenGetter(() => "expired-token");

    const protectedCallCounts: Record<string, number> = {};

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("/auth/refresh")) {
        return jsonResponse({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }

      protectedCallCounts[url] = (protectedCallCounts[url] ?? 0) + 1;
      if (protectedCallCounts[url] === 1) {
        return jsonResponse({ detail: "expired" }, 401);
      }
      return jsonResponse({ result: "success" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [resultA, resultB] = await Promise.all([
      apiRequest<{ result: string }>("/protected-a"),
      apiRequest<{ result: string }>("/protected-b"),
    ]);

    expect(resultA).toEqual({ result: "success" });
    expect(resultB).toEqual({ result: "success" });

    const refreshCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe("new-refresh-token");
  });
});

/**
 * Typed fetch wrapper for the DevPulse API.
 *
 * `auth-context.tsx` wires up `setTokenGetter`, `setUnauthorizedHandler`, and
 * `setOnTokenRefresh` so this module never imports React or touches storage
 * directly; it only knows how to make requests, attach the current access
 * token, and run the single-retry-after-refresh flow on a 401.
 */

import { refreshAccessToken } from "./auth";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000/api/v1";

const REFRESH_PATH = "/auth/refresh";

export class ApiError extends Error {
  status: number;
  detail: string;
  // Only set when the response carried a `Retry-After` header (the AI
  // endpoints' 429s do, via `rate_limit_by_org`). `undefined` for every
  // other error, including other 429s without the header.
  retryAfterSeconds?: number;

  constructor(status: number, detail: string, retryAfterSeconds?: number) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readRetryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (header === null) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isNaN(seconds) ? undefined : seconds;
}

let tokenGetter: () => string | null = () => null;
let unauthorizedHandler: () => void = () => {};
let onTokenRefresh: (accessToken: string) => void = () => {};

export function setTokenGetter(fn: () => string | null): void {
  tokenGetter = fn;
}

export function setUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn;
}

export function setOnTokenRefresh(fn: (accessToken: string) => void): void {
  onTokenRefresh = fn;
}

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function doFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(buildUrl(path), { ...init, headers });
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.detail === "string") {
      return data.detail;
    }
    return JSON.stringify(data);
  } catch {
    return response.statusText || "Request failed";
  }
}

async function readBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await doFetch(path, init, tokenGetter());

  if (!response.ok && response.status === 401 && path !== REFRESH_PATH) {
    let refreshed: Awaited<ReturnType<typeof refreshAccessToken>> | null = null;
    try {
      refreshed = await refreshAccessToken();
    } catch {
      refreshed = null;
    }

    if (refreshed) {
      onTokenRefresh(refreshed.accessToken);
      response = await doFetch(path, init, refreshed.accessToken);
    }

    if (!response.ok && response.status === 401) {
      unauthorizedHandler();
      throw new ApiError(401, await readErrorDetail(response), readRetryAfterSeconds(response));
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await readErrorDetail(response),
      readRetryAfterSeconds(response),
    );
  }

  return readBody<T>(response);
}

/**
 * Auth API functions. Each is a thin `apiRequest` call mapped onto the
 * backend's actual response shape (snake_case `access_token` /
 * `refresh_token`, confirmed from `backend/app/modules/auth/schemas.py`),
 * translated into the camelCase shapes the rest of the frontend consumes.
 */

import { apiRequest, ApiError } from "./client";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
}

interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
}

interface UserResponse {
  id: string;
  email: string;
}

const REFRESH_TOKEN_KEY = "devpulse_refresh_token";

function toTokenPair(dto: TokenPairResponse): TokenPair {
  return { accessToken: dto.access_token, refreshToken: dto.refresh_token };
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const dto = await apiRequest<TokenPairResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return toTokenPair(dto);
}

export async function register(email: string, password: string): Promise<TokenPair> {
  const dto = await apiRequest<TokenPairResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return toTokenPair(dto);
}

// Tracks a refresh that's already in flight so concurrent callers (e.g.
// auth-context's mount-restore effect and an independent apiRequest call
// that hits a 401 around the same time) await the same request instead of
// each reading the same pre-rotation refresh token from localStorage and
// racing the backend. Cleared once the in-flight refresh settles, so a
// later, unrelated refresh attempt isn't permanently blocked by a long-gone
// call.
let inFlightRefresh: Promise<TokenPair> | null = null;

async function doRefreshAccessToken(): Promise<TokenPair> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new ApiError(401, "No refresh token available");
  }

  const dto = await apiRequest<TokenPairResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const pair = toTokenPair(dto);
  localStorage.setItem(REFRESH_TOKEN_KEY, pair.refreshToken);
  return pair;
}

/**
 * Reads the refresh token from localStorage, exchanges it for a new token
 * pair, and persists the rotated refresh token. `client.ts` calls this once
 * on a 401 before retrying the original request; `auth-context.tsx` also
 * calls it directly on mount to restore a session. If a refresh is already
 * in flight, concurrent callers await that same promise rather than
 * starting a second one.
 */
export async function refreshAccessToken(): Promise<TokenPair> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = doRefreshAccessToken().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    return;
  }
  await apiRequest<void>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function getCurrentUser(): Promise<User> {
  const dto = await apiRequest<UserResponse>("/auth/me");
  return { id: dto.id, email: dto.email };
}

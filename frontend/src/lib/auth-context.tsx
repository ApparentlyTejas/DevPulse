import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { setOnTokenRefresh, setTokenGetter, setUnauthorizedHandler } from "./api/client";
import {
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  refreshAccessToken,
  type User,
} from "./api/auth";

const REFRESH_TOKEN_KEY = "devpulse_refresh_token";

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // `apiRequest`'s token getter/refresh hooks are read and updated outside
  // React's render cycle, so a ref -- not the state value -- is what client.ts
  // actually reads/writes synchronously.
  const accessTokenRef = useRef<string | null>(null);

  function applyAccessToken(token: string | null) {
    accessTokenRef.current = token;
    setAccessToken(token);
  }

  useEffect(() => {
    setTokenGetter(() => accessTokenRef.current);
    setOnTokenRefresh((token) => applyAccessToken(token));
    setUnauthorizedHandler(() => {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      applyAccessToken(null);
      setUser(null);
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function restoreSession() {
      const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!storedRefreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        const pair = await refreshAccessToken();
        applyAccessToken(pair.accessToken);
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        applyAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const pair = await apiLogin(email, password);
    applyAccessToken(pair.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, pair.refreshToken);
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }

  async function register(email: string, password: string) {
    const pair = await apiRegister(email, password);
    applyAccessToken(pair.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, pair.refreshToken);
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }

  async function logout() {
    try {
      await apiLogout();
    } finally {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      applyAccessToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

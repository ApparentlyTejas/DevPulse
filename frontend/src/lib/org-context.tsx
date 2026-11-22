import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { ApiError } from "./api/client";
import { createOrganization, listOrganizations, type Org } from "./api/organizations";

const SELECTED_ORG_ID_KEY = "devpulse_selected_org_id";

interface OrgContextValue {
  orgs: Org[];
  selectedOrgId: string | null;
  selectOrg: (id: string) => void;
  createOrg: (name: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

function readStoredOrgId(): string | null {
  try {
    return localStorage.getItem(SELECTED_ORG_ID_KEY);
  } catch {
    return null;
  }
}

function writeStoredOrgId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(SELECTED_ORG_ID_KEY, id);
    } else {
      localStorage.removeItem(SELECTED_ORG_ID_KEY);
    }
  } catch {
    // localStorage can throw (private browsing, storage disabled, etc.);
    // persistence is a convenience, not a correctness requirement, so a
    // failed write is silently ignored rather than crashing org selection.
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Orgs are scoped to the authenticated user, so there's nothing to load
  // (and no point making an authenticated request) until `useAuth()` has a
  // user -- e.g. on the public /login and /register routes.
  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setSelectedOrgId(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const loaded = await listOrganizations();
        if (!active) return;
        setOrgs(loaded);
        // Restore the persisted selection if it's still in the loaded
        // list (e.g. reloading `/incidents/:id` for a non-first org
        // shouldn't silently fall back and break); otherwise fall back to
        // the first org, same as before persistence existed.
        const storedId = readStoredOrgId();
        const restored = storedId && loaded.some((org) => org.id === storedId) ? storedId : null;
        const nextSelectedId = restored ?? (loaded.length > 0 ? loaded[0].id : null);
        setSelectedOrgId(nextSelectedId);
        writeStoredOrgId(nextSelectedId);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
    // Depend on the user's id rather than the `user` object reference: a
    // caller (e.g. AuthProvider after a token refresh) may hand back a new
    // object with the same fields, and re-keying off that identity would
    // re-fetch orgs on every such render instead of only on an actual
    // sign-in/sign-out. `retryCount` is included so the error view's
    // Retry button can re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, retryCount]);

  function selectOrg(id: string) {
    setSelectedOrgId(id);
    writeStoredOrgId(id);
  }

  function retry() {
    setRetryCount((prev) => prev + 1);
  }

  async function createOrg(name: string) {
    const org = await createOrganization(name);
    setOrgs((prev) => [...prev, org]);
    setSelectedOrgId(org.id);
    writeStoredOrgId(org.id);
  }

  return (
    <OrgContext.Provider
      value={{ orgs, selectedOrgId, selectOrg, createOrg, isLoading, error, retry }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrg must be used within an OrgProvider");
  }
  return ctx;
}

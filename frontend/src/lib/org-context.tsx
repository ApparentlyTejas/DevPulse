import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { createOrganization, listOrganizations, type Org } from "./api/organizations";

interface OrgContextValue {
  orgs: Org[];
  selectedOrgId: string | null;
  selectOrg: (id: string) => void;
  createOrg: (name: string) => Promise<void>;
  isLoading: boolean;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Orgs are scoped to the authenticated user, so there's nothing to load
  // (and no point making an authenticated request) until `useAuth()` has a
  // user -- e.g. on the public /login and /register routes.
  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setSelectedOrgId(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);

    async function load() {
      try {
        const loaded = await listOrganizations();
        if (!active) return;
        setOrgs(loaded);
        setSelectedOrgId(loaded.length > 0 ? loaded[0].id : null);
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
    // sign-in/sign-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function selectOrg(id: string) {
    setSelectedOrgId(id);
  }

  async function createOrg(name: string) {
    const org = await createOrganization(name);
    setOrgs((prev) => [...prev, org]);
    setSelectedOrgId(org.id);
  }

  return (
    <OrgContext.Provider value={{ orgs, selectedOrgId, selectOrg, createOrg, isLoading }}>
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

import { useState, type FormEvent } from "react";
import { Link, Navigate, Outlet } from "react-router-dom";
import { ApiError } from "../lib/api/client";
import { useAuth } from "../lib/auth-context";
import { useOrg } from "../lib/org-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function AppLayout() {
  const { user } = useAuth();
  const { orgs, selectedOrgId, selectOrg, createOrg, isLoading } = useOrg();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink">
        Loading...
      </div>
    );
  }

  if (orgs.length === 0) {
    return <CreateOrgPrompt onCreate={createOrg} />;
  }

  return (
    <div className="min-h-screen bg-bg font-sans text-ink">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-medium">DevPulse</h1>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to={selectedOrgId ? `/organizations/${selectedOrgId}/members` : "#"}
              className="text-ink underline-offset-2 hover:underline"
            >
              Members
            </Link>
          </nav>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Organization
          <Select
            value={selectedOrgId ?? ""}
            onValueChange={(value) => selectOrg(value ?? "")}
          >
            <SelectTrigger
              aria-label="Organization"
              className="rounded border border-hairline bg-surface px-2 py-1 text-sm text-ink data-placeholder:text-ink"
            >
              <SelectValue>
                {(value: string) => orgs.find((org) => org.id === value)?.name ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded border border-hairline bg-surface text-ink">
              {orgs.map((org) => (
                <SelectItem
                  key={org.id}
                  value={org.id}
                  className="text-ink focus:bg-bg focus:text-ink"
                >
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}

function CreateOrgPrompt({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onCreate(name);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg font-sans text-ink">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-sm space-y-4 rounded border border-hairline bg-surface p-8"
      >
        <h1 className="text-lg font-medium">Create organization</h1>
        <p className="text-sm">You need an organization before you can continue.</p>

        <div className="space-y-1">
          <label htmlFor="org-name" className="block text-sm">
            Organization name
          </label>
          <input
            id="org-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
          />
        </div>

        {error && <p className="text-sm text-critical">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting || name.trim().length === 0}
          className="w-full rounded bg-accent-blue px-3 py-2 text-ink disabled:opacity-60"
        >
          Create organization
        </button>
      </form>
    </div>
  );
}

export default AppLayout;

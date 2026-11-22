import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listTriages, runTriage, type IncidentTriage } from "../lib/api/ai";
import { ApiError } from "../lib/api/client";

export interface TriageHistoryProps {
  orgId: string;
  incidentId: string;
}

// Distinguishes the AI budget being exhausted (429, `Retry-After`-bearing,
// shared across triage and postmortem per `rate_limit_by_org`) from the
// Claude call itself failing (502, `AITriageError` ->
// `detail=f"AI triage failed: {exc}"`) from everything else. The Review
// Focus for this task specifically calls out the first case needing its
// own message, not a generic toast.
function describeRunTriageError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return err.retryAfterSeconds != null
        ? `Triage is rate-limited for this organization. Try again in ${err.retryAfterSeconds} seconds.`
        : "Triage is rate-limited for this organization. Try again shortly.";
    }
    return err.detail;
  }
  return "Something went wrong. Please try again.";
}

export function TriageHistory({ orgId, incidentId }: TriageHistoryProps) {
  const queryClient = useQueryClient();
  const [runError, setRunError] = useState<string | null>(null);

  const queryKey = ["triages", orgId, incidentId];
  const {
    data: triages,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listTriages(orgId, incidentId),
  });

  const runTriageMutation = useMutation({
    mutationFn: () => runTriage(orgId, incidentId),
    onError: (err) => setRunError(describeRunTriageError(err)),
    onSuccess: (triage) => {
      setRunError(null);
      queryClient.setQueryData<IncidentTriage[]>(queryKey, (prev) => [triage, ...(prev ?? [])]);
    },
  });

  if (isLoading) {
    return <p className="text-sm text-ink">Loading triage history...</p>;
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-critical">Failed to load triage history.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded border border-hairline px-3 py-2 text-sm text-ink"
        >
          Retry
        </button>
      </div>
    );
  }

  const sorted = [...(triages ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Triage history</h3>
        <button
          type="button"
          onClick={() => runTriageMutation.mutate()}
          disabled={runTriageMutation.isPending}
          className="rounded border border-hairline px-3 py-2 text-sm text-ink disabled:opacity-60"
        >
          {runTriageMutation.isPending ? "Running triage..." : "Run triage"}
        </button>
      </div>

      {runError && <p className="text-sm text-critical">{runError}</p>}

      {sorted.length === 0 ? (
        <p className="text-sm text-ink">No triage runs yet.</p>
      ) : (
        <ol className="space-y-4 border-l border-hairline pl-4">
          {sorted.map((triage) => (
            <li key={triage.id} data-testid="triage-entry" className="space-y-1 text-sm text-ink">
              <p className="font-mono text-xs text-ink/60">{triage.created_at}</p>
              <p>{triage.summary}</p>
              <p className="text-xs text-ink/60">
                Suggested severity:{" "}
                <span className="font-mono">{triage.suggested_severity ?? "none"}</span>
                {" · "}
                Confidence: <span className="font-mono">{triage.confidence.toFixed(2)}</span>
                {" · "}
                Model: <span className="font-mono">{triage.model}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default TriageHistory;

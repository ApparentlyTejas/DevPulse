import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IncidentFactsRail } from "../components/IncidentFactsRail";
import { TriageHistory } from "../components/TriageHistory";
import { ApiError } from "../lib/api/client";
import { getIncident, updateIncidentStatus, type IncidentStatus } from "../lib/api/incidents";
import { useOrg } from "../lib/org-context";

export function IncidentDetailPage() {
  const { id: incidentId } = useParams<{ id: string }>();
  const { selectedOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const queryKey = ["incident", selectedOrgId, incidentId];
  const {
    data: incident,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => getIncident(selectedOrgId as string, incidentId as string),
    enabled: selectedOrgId != null && incidentId != null,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: IncidentStatus) =>
      updateIncidentStatus(selectedOrgId as string, incidentId as string, status),
    onError: (err) => {
      // A 422 here means the incident's status already moved on (e.g. a
      // race with another tab) since we last fetched -- the backend's
      // `_VALID_TRANSITIONS` rejected the transition we tried. Surface it
      // and refetch so the rail reflects the incident's real current
      // status, same pattern as `AlertEventsTab`.
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
      void refetch();
    },
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!selectedOrgId || !incidentId) {
    return <p className="text-sm text-ink">Select an organization to view this incident.</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-ink">Loading incident...</p>;
  }

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-ink">This incident could not be found.</p>
          <Link to="/incidents" className="text-sm text-accent-blue underline">
            Back to incidents
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-sm text-critical">Failed to load this incident.</p>
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

  if (!incident) {
    return null;
  }

  return (
    <div className="space-y-4">
      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-ink">{incident.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
              {incident.description ?? ""}
            </p>
          </div>

          <TriageHistory orgId={selectedOrgId} incidentId={incidentId} />

          {/* Postmortem (Task 13) mounts here. */}
          <div className="rounded border border-dashed border-hairline p-4 text-sm text-ink/60">
            Postmortem coming soon.
          </div>
        </div>

        <IncidentFactsRail
          incident={incident}
          onStatusChange={(status) => updateStatusMutation.mutate(status)}
          isChangingStatus={updateStatusMutation.isPending}
        />
      </div>
    </div>
  );
}

export default IncidentDetailPage;

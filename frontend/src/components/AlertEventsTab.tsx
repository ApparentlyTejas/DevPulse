import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listAlertEvents,
  updateAlertEventStatus,
  type AlertEvent,
  type AlertEventStatus,
} from "../lib/api/alerts";
import { ApiError } from "../lib/api/client";

const PAGE_LIMIT = 20;

// Mirrors `_VALID_TRANSITIONS` in `backend/app/modules/alerts/service.py`,
// which the `PATCH .../events/{id}/status` endpoint enforces server-side
// (an out-of-set transition is rejected with a 422). Keeping this map here
// means the row only ever offers a button for a transition the backend will
// actually accept -- there's no "re-open" or "re-acknowledge" control, and a
// resolved event has no actions left at all.
type TransitionTarget = Exclude<AlertEventStatus, "open">;

const VALID_TRANSITIONS: Record<AlertEventStatus, TransitionTarget[]> = {
  open: ["acknowledged", "resolved"],
  acknowledged: ["resolved"],
  resolved: [],
};

// The label for the button that transitions a row *to* this status (not
// the row's current status) -- e.g. the button that moves an open event to
// "acknowledged" reads "Acknowledge". Nothing transitions to "open" (see
// `VALID_TRANSITIONS` above), so it has no label here.
const TRANSITION_LABELS: Record<TransitionTarget, string> = {
  acknowledged: "Acknowledge",
  resolved: "Resolve",
};

export interface AlertEventsTabProps {
  orgId: string;
  serviceId: string;
}

export function AlertEventsTab({ orgId, serviceId }: AlertEventsTabProps) {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryKey = ["alert-events", orgId, serviceId, PAGE_LIMIT, offset];
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listAlertEvents(orgId, serviceId, { limit: PAGE_LIMIT, offset }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["alert-events", orgId, serviceId] });
  }

  const updateStatusMutation = useMutation({
    mutationFn: ({ eventId, status }: { eventId: string; status: AlertEventStatus }) =>
      updateAlertEventStatus(orgId, serviceId, eventId, status),
    onError: (err) => {
      // A 422 here means the event's status already moved on (someone else
      // resolved it, say) since we last fetched the list -- the backend's
      // `_VALID_TRANSITIONS` rejected the transition we tried. Surface it
      // and refetch so the row reflects the event's real current status.
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
    },
    onSuccess: () => setActionError(null),
    onSettled: () => invalidate(),
  });

  function handleStatusChange(event: AlertEvent, status: AlertEventStatus) {
    updateStatusMutation.mutate({ eventId: event.id, status });
  }

  if (isLoading) {
    return <p className="text-sm text-ink">Loading alert events...</p>;
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-critical">Failed to load alert events.</p>
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

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_LIMIT < total;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-ink">Alert events</h3>

      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-ink">No alert events yet.</p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm text-ink">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 font-medium">Title</th>
                <th className="py-2 pr-4 font-medium">Severity</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event) => {
                const nextStatuses = VALID_TRANSITIONS[event.alert_status];
                return (
                  <tr key={event.id} className="border-b border-hairline">
                    <td className="py-2 pr-4">
                      <div>{event.title}</div>
                      {event.message && (
                        <div className="text-xs text-ink/60">{event.message}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono">{event.severity}</td>
                    <td className="py-2 pr-4 font-mono">{event.alert_status}</td>
                    <td className="py-2 pr-4 font-mono">{event.created_at}</td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        {nextStatuses.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => handleStatusChange(event, status)}
                            disabled={updateStatusMutation.isPending}
                            className="rounded border border-hairline px-2 py-1 text-xs text-ink disabled:opacity-60"
                          >
                            {TRANSITION_LABELS[status]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between text-sm text-ink">
            <span>
              Showing {offset + 1}-{Math.min(offset + PAGE_LIMIT, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!hasPrevious}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_LIMIT))}
                className="rounded border border-hairline px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => setOffset((prev) => prev + PAGE_LIMIT)}
                className="rounded border border-hairline px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AlertEventsTab;

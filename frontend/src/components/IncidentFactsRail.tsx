import type { Incident, IncidentStatus } from "../lib/api/incidents";

// Mirrors `_VALID_TRANSITIONS` in `backend/app/modules/incidents/service.py`,
// which the `PATCH .../incidents/{id}/status` endpoint enforces server-side
// (an out-of-set transition is rejected with a 422). Keeping this map here
// means the rail only ever offers a button for a transition the backend
// will actually accept -- same pattern as `AlertEventsTab`'s
// `VALID_TRANSITIONS` -- and a resolved incident has no actions left at all.
type TransitionTarget = Exclude<IncidentStatus, "open">;

const VALID_TRANSITIONS: Record<IncidentStatus, TransitionTarget[]> = {
  open: ["investigating", "resolved"],
  investigating: ["identified", "resolved"],
  identified: ["monitoring", "resolved"],
  monitoring: ["resolved"],
  resolved: [],
};

// The label for the button that transitions the incident *to* this status
// (not the incident's current status) -- nothing transitions to "open", so
// it has no label here.
const TRANSITION_LABELS: Record<TransitionTarget, string> = {
  investigating: "Start investigating",
  identified: "Mark identified",
  monitoring: "Start monitoring",
  resolved: "Resolve",
};

export interface IncidentFactsRailProps {
  incident: Incident;
  onStatusChange: (status: IncidentStatus) => void;
  isChangingStatus: boolean;
}

export function IncidentFactsRail({
  incident,
  onStatusChange,
  isChangingStatus,
}: IncidentFactsRailProps) {
  const nextStatuses = VALID_TRANSITIONS[incident.incident_status];

  return (
    <aside className="space-y-4 rounded border border-hairline p-4 text-sm text-ink">
      <div>
        <h3 className="text-ink/60">Status</h3>
        <p className="font-mono">{incident.incident_status}</p>
        {nextStatuses.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {nextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onStatusChange(status)}
                disabled={isChangingStatus}
                className="rounded border border-hairline px-2 py-1 text-xs text-ink disabled:opacity-60"
              >
                {TRANSITION_LABELS[status]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-ink/60">Severity</h3>
        <p className="font-mono">{incident.severity}</p>
      </div>

      <div>
        <h3 className="text-ink/60">Service</h3>
        <p className="font-mono">{incident.service_id ?? "None"}</p>
      </div>

      <div>
        <h3 className="text-ink/60">Created</h3>
        <p className="font-mono">{incident.created_at}</p>
      </div>

      <div>
        <h3 className="text-ink/60">Updated</h3>
        <p className="font-mono">{incident.updated_at}</p>
      </div>
    </aside>
  );
}

export default IncidentFactsRail;

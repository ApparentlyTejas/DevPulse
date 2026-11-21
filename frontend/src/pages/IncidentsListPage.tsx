import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  IncidentFormDialog,
  type IncidentFormInitialValues,
  type IncidentFormValues,
} from "../components/IncidentFormDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ApiError } from "../lib/api/client";
import {
  createIncident,
  deleteIncident,
  listIncidents,
  updateIncident,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
} from "../lib/api/incidents";
import { useOrg } from "../lib/org-context";

const PAGE_LIMIT = 20;

const STATUS_OPTIONS: IncidentStatus[] = [
  "open",
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];
const SEVERITY_OPTIONS: IncidentSeverity[] = ["sev1", "sev2", "sev3", "sev4"];

// Exact severity-to-color mapping per the design spec: sev1 is critical
// red, sev2 orange, sev3 blue, sev4 gets no color (ink at reduced
// opacity). Color is signal here (the row's severity), not decoration --
// this dot is the only saturated color used on the page.
const SEVERITY_DOT_CLASS: Record<IncidentSeverity, string> = {
  sev1: "bg-critical",
  sev2: "bg-accent-orange",
  sev3: "bg-accent-blue",
  sev4: "bg-ink/40",
};

export function IncidentsListPage() {
  const { selectedOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "">("");
  // Reset to the first page whenever the org, status filter, or severity
  // filter changes -- done here during render (React's documented pattern
  // for resetting state when a prop/input changes), the same approach
  // `ServicesListPage` uses for org changes, so a stale offset never gets
  // combined with a new filter/org in the same query.
  const [paginatedFor, setPaginatedFor] = useState({
    orgId: selectedOrgId,
    status: statusFilter,
    severity: severityFilter,
  });
  if (
    paginatedFor.orgId !== selectedOrgId ||
    paginatedFor.status !== statusFilter ||
    paginatedFor.severity !== severityFilter
  ) {
    setPaginatedFor({ orgId: selectedOrgId, status: statusFilter, severity: severityFilter });
    setOffset(0);
  }

  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { open: false }
    | { open: true; mode: "create" }
    | { open: true; mode: "edit"; incident: Incident }
  >({ open: false });

  const filters = {
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
  };
  const queryKey = ["incidents", selectedOrgId, statusFilter, severityFilter, PAGE_LIMIT, offset];
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () =>
      listIncidents(selectedOrgId as string, filters, { limit: PAGE_LIMIT, offset }),
    enabled: selectedOrgId != null,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["incidents", selectedOrgId] });
  }

  const createMutation = useMutation({
    mutationFn: (values: IncidentFormValues) =>
      createIncident(selectedOrgId as string, {
        title: values.title,
        description: values.description || undefined,
        severity: values.severity,
        service_id: values.service_id || undefined,
      }),
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ incidentId, values }: { incidentId: string; values: IncidentFormValues }) =>
      updateIncident(selectedOrgId as string, incidentId, {
        title: values.title,
        description: values.description || undefined,
        severity: values.severity,
      }),
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (incidentId: string) => deleteIncident(selectedOrgId as string, incidentId),
    onError: (err) => {
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
    },
    onSuccess: () => setActionError(null),
    onSettled: () => invalidate(),
  });

  async function handleCreate(values: IncidentFormValues) {
    if (!selectedOrgId) return;
    await createMutation.mutateAsync(values);
  }

  async function handleEdit(incident: Incident, values: IncidentFormValues) {
    if (!selectedOrgId) return;
    await updateMutation.mutateAsync({ incidentId: incident.id, values });
  }

  function handleDelete(incident: Incident) {
    if (!selectedOrgId) return;
    deleteMutation.mutate(incident.id);
  }

  if (!selectedOrgId) {
    return <p className="text-sm text-ink">Select an organization to view its incidents.</p>;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_LIMIT < total;
  const hasActiveFilters = statusFilter !== "" || severityFilter !== "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-ink">Incidents</h2>
        <button
          type="button"
          onClick={() => setDialogState({ open: true, mode: "create" })}
          className="rounded bg-accent-blue px-3 py-2 text-sm text-ink"
        >
          New incident
        </button>
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          Status
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter((value ?? "") as IncidentStatus | "")}
          >
            <SelectTrigger
              aria-label="Status"
              className="rounded border border-hairline bg-surface px-2 py-1 text-sm font-mono text-ink"
            >
              <SelectValue>{(value: string) => value || "All"}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded border border-hairline bg-surface font-mono text-ink">
              <SelectItem value="" className="text-ink focus:bg-bg focus:text-ink">
                All
              </SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status} className="text-ink focus:bg-bg focus:text-ink">
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink">
          Severity
          <Select
            value={severityFilter}
            onValueChange={(value) => setSeverityFilter((value ?? "") as IncidentSeverity | "")}
          >
            <SelectTrigger
              aria-label="Severity"
              className="rounded border border-hairline bg-surface px-2 py-1 text-sm font-mono text-ink"
            >
              <SelectValue>{(value: string) => value || "All"}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded border border-hairline bg-surface font-mono text-ink">
              <SelectItem value="" className="text-ink focus:bg-bg focus:text-ink">
                All
              </SelectItem>
              {SEVERITY_OPTIONS.map((severity) => (
                <SelectItem
                  key={severity}
                  value={severity}
                  className="text-ink focus:bg-bg focus:text-ink"
                >
                  {severity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      {isLoading && <p className="text-sm text-ink">Loading incidents...</p>}

      {isError && !isLoading && (
        <div className="space-y-2">
          <p className="text-sm text-critical">Failed to load incidents.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded border border-hairline px-3 py-2 text-sm text-ink"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && total === 0 && (
        <p className="text-sm text-ink">
          {hasActiveFilters
            ? "No incidents match the selected filters."
            : "No incidents yet. Create one to get started."}
        </p>
      )}

      {!isLoading && !isError && total > 0 && (
        <>
          <table className="w-full border-collapse text-sm text-ink">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 font-medium">Severity</th>
                <th className="py-2 pr-4 font-medium">Title</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((incident) => (
                <tr key={incident.id} className="border-b border-hairline">
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2 font-mono">
                      <span
                        data-testid={`severity-dot-${incident.id}`}
                        className={`inline-block h-2.5 w-2.5 rounded-full ${SEVERITY_DOT_CLASS[incident.severity]}`}
                      />
                      {incident.severity}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{incident.title}</td>
                  <td className="py-2 pr-4 font-mono">{incident.incident_status}</td>
                  <td className="py-2 pr-4 font-mono">{incident.created_at}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDialogState({ open: true, mode: "edit", incident })}
                        className="rounded border border-hairline px-2 py-1 text-xs text-ink"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(incident)}
                        className="rounded border border-hairline px-2 py-1 text-xs text-critical"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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

      <IncidentFormDialog
        open={dialogState.open}
        mode={dialogState.open ? dialogState.mode : "create"}
        orgId={selectedOrgId}
        initialValues={
          dialogState.open && dialogState.mode === "edit"
            ? toInitialValues(dialogState.incident)
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setDialogState({ open: false });
        }}
        onSubmit={(values) => {
          if (dialogState.open && dialogState.mode === "edit") {
            return handleEdit(dialogState.incident, values);
          }
          return handleCreate(values);
        }}
      />
    </div>
  );
}

function toInitialValues(incident: Incident): IncidentFormInitialValues {
  return {
    title: incident.title,
    description: incident.description,
    severity: incident.severity,
  };
}

export default IncidentsListPage;

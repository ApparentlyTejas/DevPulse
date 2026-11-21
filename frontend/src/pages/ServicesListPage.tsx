import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ServiceFormDialog,
  type ServiceFormInitialValues,
  type ServiceFormValues,
} from "../components/ServiceFormDialog";
import { ApiError } from "../lib/api/client";
import {
  createService,
  deleteService,
  listServices,
  updateService,
  type Service,
} from "../lib/api/services";
import { useOrg } from "../lib/org-context";

const PAGE_LIMIT = 20;

export function ServicesListPage() {
  const { selectedOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { open: false }
    | { open: true; mode: "create" }
    | { open: true; mode: "edit"; service: Service }
  >({ open: false });

  const queryKey = ["services", selectedOrgId, PAGE_LIMIT, offset];
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listServices(selectedOrgId as string, { limit: PAGE_LIMIT, offset }),
    enabled: selectedOrgId != null,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["services", selectedOrgId] });
  }

  const createMutation = useMutation({
    mutationFn: (values: ServiceFormValues) =>
      createService(selectedOrgId as string, {
        name: values.name,
        description: values.description || undefined,
        repository_url: values.repository_url || undefined,
      }),
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ serviceId, values }: { serviceId: string; values: ServiceFormValues }) =>
      updateService(selectedOrgId as string, serviceId, {
        name: values.name,
        description: values.description || undefined,
        repository_url: values.repository_url || undefined,
        status: values.status,
      }),
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (serviceId: string) => deleteService(selectedOrgId as string, serviceId),
    onError: (err) => {
      // A 404 here means someone else already deleted this service (a
      // stale row in our list); any other failure is surfaced the same
      // way. Either way, the `onSettled` refetch below makes the list
      // reflect reality instead of leaving a row the user just tried to
      // act on.
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
    },
    onSuccess: () => setActionError(null),
    // `invalidateQueries` already refetches this query since it's active
    // (mounted and being observed), so there's no need to also call
    // `refetch()` -- doing both would fire two requests.
    onSettled: () => invalidate(),
  });

  async function handleCreate(values: ServiceFormValues) {
    if (!selectedOrgId) return;
    await createMutation.mutateAsync(values);
  }

  async function handleEdit(service: Service, values: ServiceFormValues) {
    if (!selectedOrgId) return;
    await updateMutation.mutateAsync({ serviceId: service.id, values });
  }

  function handleDelete(service: Service) {
    if (!selectedOrgId) return;
    deleteMutation.mutate(service.id);
  }

  if (!selectedOrgId) {
    return <p className="text-sm text-ink">Select an organization to view its services.</p>;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_LIMIT < total;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-ink">Services</h2>
        <button
          type="button"
          onClick={() => setDialogState({ open: true, mode: "create" })}
          className="rounded bg-accent-blue px-3 py-2 text-sm text-ink"
        >
          New service
        </button>
      </div>

      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      {isLoading && <p className="text-sm text-ink">Loading services...</p>}

      {isError && !isLoading && (
        <div className="space-y-2">
          <p className="text-sm text-critical">Failed to load services.</p>
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
        <p className="text-sm text-ink">No services yet. Create one to get started.</p>
      )}

      {!isLoading && !isError && total > 0 && (
        <>
          <table className="w-full border-collapse text-sm text-ink">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((service) => (
                <tr key={service.id} className="border-b border-hairline">
                  <td className="py-2 pr-4">{service.name}</td>
                  <td className="py-2 pr-4">{service.description ?? ""}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDialogState({ open: true, mode: "edit", service })}
                        className="rounded border border-hairline px-2 py-1 text-xs text-ink"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(service)}
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

      <ServiceFormDialog
        open={dialogState.open}
        mode={dialogState.open ? dialogState.mode : "create"}
        initialValues={
          dialogState.open && dialogState.mode === "edit"
            ? toInitialValues(dialogState.service)
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setDialogState({ open: false });
        }}
        onSubmit={(values) => {
          if (dialogState.open && dialogState.mode === "edit") {
            return handleEdit(dialogState.service, values);
          }
          return handleCreate(values);
        }}
      />
    </div>
  );
}

function toInitialValues(service: Service): ServiceFormInitialValues {
  return {
    name: service.name,
    description: service.description,
    // `Service` (the minimal list-row shape) doesn't carry `repository_url`
    // or `status`; the edit dialog starts those blank/default rather than
    // fetching the full resource, which is out of scope for this task.
    repository_url: "",
    status: "unknown",
  };
}

export default ServicesListPage;

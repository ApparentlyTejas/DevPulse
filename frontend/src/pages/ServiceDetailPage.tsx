import { Tabs } from "@base-ui/react/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertEventsTab } from "../components/AlertEventsTab";
import { AlertRulesTab } from "../components/AlertRulesTab";
import {
  ServiceFormDialog,
  type ServiceFormInitialValues,
  type ServiceFormValues,
} from "../components/ServiceFormDialog";
import { ApiError } from "../lib/api/client";
import { deleteService, getService, updateService } from "../lib/api/services";
import { useOrg } from "../lib/org-context";

const TAB_TRIGGER_CLASSES =
  "rounded px-3 py-2 text-sm text-ink data-[selected]:bg-surface data-[selected]:text-ink hover:bg-surface";

export function ServiceDetailPage() {
  const { id: serviceId } = useParams<{ id: string }>();
  const { selectedOrgId } = useOrg();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryKey = ["service", selectedOrgId, serviceId];
  const {
    data: service,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => getService(selectedOrgId as string, serviceId as string),
    enabled: selectedOrgId != null && serviceId != null,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      values,
      dirtyFields,
    }: {
      values: ServiceFormValues;
      dirtyFields: Partial<Record<keyof ServiceFormValues, boolean>>;
    }) =>
      updateService(selectedOrgId as string, serviceId as string, {
        name: values.name,
        description: values.description || undefined,
        repository_url: values.repository_url || undefined,
        status: dirtyFields.status ? values.status : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["services", selectedOrgId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteService(selectedOrgId as string, serviceId as string),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["services", selectedOrgId] });
      navigate("/services");
    },
    onError: (err) => {
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
    },
  });

  if (!selectedOrgId || !serviceId) {
    return <p className="text-sm text-ink">Select an organization to view this service.</p>;
  }

  if (isLoading) {
    return <p className="text-sm text-ink">Loading service...</p>;
  }

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-ink">This service could not be found.</p>
          <Link to="/services" className="text-sm text-accent-blue underline">
            Back to services
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="text-sm text-critical">Failed to load this service.</p>
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

  if (!service) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-ink">{service.name}</h2>
          <p className="font-mono text-xs text-ink/60">{service.slug}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded border border-hairline px-3 py-2 text-sm text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            className="rounded border border-hairline px-3 py-2 text-sm text-critical"
          >
            Delete
          </button>
        </div>
      </div>

      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      <Tabs.Root defaultValue="overview" className="space-y-4">
        <Tabs.List className="flex gap-1 border-b border-hairline">
          <Tabs.Tab value="overview" className={TAB_TRIGGER_CLASSES}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="alert-rules" className={TAB_TRIGGER_CLASSES}>
            Alert Rules
          </Tabs.Tab>
          <Tabs.Tab value="alert-events" className={TAB_TRIGGER_CLASSES}>
            Alert Events
          </Tabs.Tab>
          <Tabs.Tab value="metrics" className={TAB_TRIGGER_CLASSES}>
            Metrics
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" className="space-y-3 text-sm text-ink">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2">
            <dt className="text-ink/60">Id</dt>
            <dd className="font-mono">{service.id}</dd>

            <dt className="text-ink/60">Status</dt>
            <dd>{service.status}</dd>

            <dt className="text-ink/60">Description</dt>
            <dd>{service.description ?? ""}</dd>

            <dt className="text-ink/60">Repository</dt>
            <dd>{service.repository_url ?? ""}</dd>

            <dt className="text-ink/60">Created</dt>
            <dd className="font-mono">{service.created_at}</dd>

            <dt className="text-ink/60">Updated</dt>
            <dd className="font-mono">{service.updated_at}</dd>
          </dl>
        </Tabs.Panel>

        {/*
          Metrics content is owned by Task 9; this task only provides the
          tab shell it'll mount into. Alert Rules (Task 7) and Alert Events
          (Task 8) are filled in.
        */}
        <Tabs.Panel value="alert-rules" className="text-sm text-ink">
          <AlertRulesTab orgId={selectedOrgId} serviceId={serviceId} />
        </Tabs.Panel>
        <Tabs.Panel value="alert-events" className="text-sm text-ink">
          <AlertEventsTab orgId={selectedOrgId} serviceId={serviceId} />
        </Tabs.Panel>
        <Tabs.Panel value="metrics" className="text-sm text-ink">
          Coming soon.
        </Tabs.Panel>
      </Tabs.Root>

      <ServiceFormDialog
        open={editOpen}
        mode="edit"
        initialValues={toInitialValues(service)}
        onOpenChange={setEditOpen}
        onSubmit={async (values, dirtyFields) => {
          await updateMutation.mutateAsync({ values, dirtyFields });
        }}
      />
    </div>
  );
}

function toInitialValues(service: {
  name: string;
  description: string | null;
  repository_url: string | null;
  status: ServiceFormInitialValues["status"];
}): ServiceFormInitialValues {
  return {
    name: service.name,
    description: service.description,
    repository_url: service.repository_url,
    status: service.status,
  };
}

export default ServiceDetailPage;

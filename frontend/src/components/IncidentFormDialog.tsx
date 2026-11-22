import { Dialog } from "@base-ui/react/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../lib/api/client";
import type { IncidentSeverity } from "../lib/api/incidents";
import { listServices } from "../lib/api/services";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const SEVERITY_OPTIONS: IncidentSeverity[] = ["sev1", "sev2", "sev3", "sev4"];

// `title`/`description` mirror the backend's
// `CreateIncidentRequest`/`UpdateIncidentRequest`
// (`backend/app/modules/incidents/schemas.py`) and go through
// `react-hook-form`'s `register`/validation as usual. `severity`/
// `service_id` are driven by the shadcn `Select` below instead (plain
// local state, not `register`d -- see the note by their `useState` calls),
// so they're validated by their `<Select>`'s fixed option list rather than
// this schema, and merged in on submit. `service_id` is only part of
// `CreateIncidentRequest` -- the backend doesn't accept changing the
// linked service after creation, so this form only shows that field in
// "create" mode.
const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional(),
});

type FormFields = z.infer<typeof formSchema>;

export interface IncidentFormValues extends FormFields {
  severity: IncidentSeverity;
  service_id?: string;
}

export interface IncidentFormInitialValues {
  title: string;
  description?: string | null;
  severity: IncidentSeverity;
}

interface IncidentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  orgId: string | null;
  initialValues?: IncidentFormInitialValues;
  onSubmit: (values: IncidentFormValues) => Promise<void>;
}

const EMPTY_VALUES: FormFields = {
  title: "",
  description: "",
};

export function IncidentFormDialog({
  open,
  onOpenChange,
  mode,
  orgId,
  initialValues,
  onSubmit,
}: IncidentFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_VALUES,
  });

  // `severity`/`service_id` are driven by the shadcn `Select` (a controlled
  // component), not `register`, so they're tracked as plain local state
  // instead of through `useForm`'s `watch` -- `watch` returns a new
  // subscribe function on every call, which React Compiler flags as
  // unmemoizable (see the `react(incompatible-library)` lint rule) and
  // isn't needed here since these two fields never go through validation
  // beyond the enum/optional checks already encoded in their `<Select>`.
  const [severity, setSeverity] = useState<IncidentSeverity>(
    initialValues?.severity ?? "sev3",
  );
  const [serviceId, setServiceId] = useState("");

  // The dropdown of services to optionally link a new incident to.
  // `listServices` is reused as-is from Task 5 for a simple, unpaginated
  // dropdown -- a reasonably-sized org's service list fits in one request,
  // the same assumption the plan already makes for other small lists.
  const { data: servicesPage } = useQuery({
    queryKey: ["services", orgId, "incident-form-dropdown"],
    queryFn: () => listServices(orgId as string, { limit: 100, offset: 0 }),
    enabled: open && mode === "create" && orgId != null,
  });
  const services = servicesPage?.items ?? [];

  // Re-seed the form whenever the dialog opens (fresh for create, populated
  // for edit), rather than once on mount: the same dialog instance is
  // reused across repeated opens with different initial values. Done here
  // during render (React's documented pattern for resetting state when a
  // prop changes, already used by `ServicesListPage`/`IncidentsListPage`
  // for their own state resets) rather than in an effect, which avoids an
  // extra render pass and the `react(set-state-in-effect)` lint warning a
  // raw `setState` call inside an effect would trigger.
  const [seededOpen, setSeededOpen] = useState(open);
  if (open !== seededOpen) {
    setSeededOpen(open);
    if (open) {
      reset({
        title: initialValues?.title ?? "",
        description: initialValues?.description ?? "",
      });
      setSeverity(initialValues?.severity ?? "sev3");
      setServiceId("");
    }
  }

  async function submit(values: FormFields) {
    try {
      await onSubmit({ ...values, severity, service_id: serviceId });
      onOpenChange(false);
    } catch (err) {
      setError("title", {
        message: err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      });
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-bg/80" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded border border-hairline bg-surface p-6 font-sans text-ink">
          <Dialog.Title className="text-lg font-medium">
            {mode === "create" ? "New incident" : "Edit incident"}
          </Dialog.Title>

          <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 space-y-4">
            <div className="space-y-1">
              <label htmlFor="incident-title" className="block text-sm">
                Title
              </label>
              <input
                id="incident-title"
                className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("title")}
              />
              {errors.title && <p className="text-sm text-critical">{errors.title.message}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="incident-description" className="block text-sm">
                Description
              </label>
              <textarea
                id="incident-description"
                className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("description")}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="incident-severity" className="block text-sm">
                Severity
              </label>
              <Select
                value={severity}
                onValueChange={(value) => setSeverity(value as IncidentSeverity)}
              >
                <SelectTrigger
                  id="incident-severity"
                  aria-label="Severity"
                  className="w-full rounded border border-hairline bg-bg px-3 py-2 text-sm font-mono text-ink"
                >
                  <SelectValue>{(value: string) => value}</SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded border border-hairline bg-surface font-mono text-ink">
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
            </div>

            {mode === "create" && (
              <div className="space-y-1">
                <label htmlFor="incident-service" className="block text-sm">
                  Service (optional)
                </label>
                <Select
                  value={serviceId}
                  onValueChange={(value) => setServiceId(value ?? "")}
                >
                  <SelectTrigger
                    id="incident-service"
                    aria-label="Service"
                    className="w-full rounded border border-hairline bg-bg px-3 py-2 text-sm text-ink"
                  >
                    <SelectValue>
                      {(value: string) =>
                        services.find((service) => service.id === value)?.name ?? "None"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded border border-hairline bg-surface text-ink">
                    <SelectItem value="" className="text-ink focus:bg-bg focus:text-ink">
                      None
                    </SelectItem>
                    {services.map((service) => (
                      <SelectItem
                        key={service.id}
                        value={service.id}
                        className="text-ink focus:bg-bg focus:text-ink"
                      >
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded border border-hairline px-3 py-2 text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-accent-blue px-3 py-2 text-ink disabled:opacity-60"
              >
                {mode === "create" ? "Create incident" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default IncidentFormDialog;

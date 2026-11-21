import { Dialog } from "@base-ui/react/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../lib/api/client";
import type { ServiceStatus } from "../lib/api/services";

const STATUS_OPTIONS: ServiceStatus[] = ["unknown", "healthy", "degraded", "down"];

// `name` mirrors the backend's `CreateServiceRequest`/`UpdateServiceRequest`
// (`backend/app/modules/services/schemas.py`): required, non-empty.
// `description` and `repository_url` are both optional there, and `status`
// is only accepted on update -- the schema below is shared by create and
// edit, with `status` simply unused (and hidden) for create.
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  repository_url: z.string().optional(),
  status: z.enum(["unknown", "healthy", "degraded", "down"]),
});

export type ServiceFormValues = z.infer<typeof formSchema>;

export interface ServiceFormInitialValues {
  name: string;
  description?: string | null;
  repository_url?: string | null;
  status?: ServiceStatus;
}

interface ServiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialValues?: ServiceFormInitialValues;
  // `dirtyFields` tells the caller which fields the user actually touched
  // during this submit, so it can decide (e.g. for `status`) whether a
  // field should be sent at all rather than always sending its current
  // form value -- see `ServicesListPage`'s `updateMutation`.
  onSubmit: (
    values: ServiceFormValues,
    dirtyFields: Partial<Record<keyof ServiceFormValues, boolean>>,
  ) => Promise<void>;
}

const EMPTY_VALUES: ServiceFormValues = {
  name: "",
  description: "",
  repository_url: "",
  status: "unknown",
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSubmit,
}: ServiceFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_VALUES,
  });

  // Re-seed the form whenever the dialog opens (fresh for create, populated
  // for edit), rather than once on mount: the same dialog instance is
  // reused across repeated opens with different initial values.
  useEffect(() => {
    if (open) {
      reset({
        name: initialValues?.name ?? "",
        description: initialValues?.description ?? "",
        repository_url: initialValues?.repository_url ?? "",
        status: initialValues?.status ?? "unknown",
      });
    }
  }, [open, initialValues, reset]);

  async function submit(values: ServiceFormValues) {
    try {
      await onSubmit(values, dirtyFields);
      onOpenChange(false);
    } catch (err) {
      setError("name", {
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
            {mode === "create" ? "New service" : "Edit service"}
          </Dialog.Title>

          <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 space-y-4">
            <div className="space-y-1">
              <label htmlFor="service-name" className="block text-sm">
                Name
              </label>
              <input
                id="service-name"
                className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("name")}
              />
              {errors.name && <p className="text-sm text-critical">{errors.name.message}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="service-description" className="block text-sm">
                Description
              </label>
              <textarea
                id="service-description"
                className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("description")}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="service-repository-url" className="block text-sm">
                Repository URL
              </label>
              <input
                id="service-repository-url"
                className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("repository_url")}
              />
            </div>

            {mode === "edit" && (
              <div className="space-y-1">
                <label htmlFor="service-status" className="block text-sm">
                  Status
                </label>
                <select
                  id="service-status"
                  className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                  {...register("status")}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
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
                {mode === "create" ? "Create service" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ServiceFormDialog;

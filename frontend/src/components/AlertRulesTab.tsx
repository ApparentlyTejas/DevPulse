import { Dialog } from "@base-ui/react/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  createAlertRule,
  deleteAlertRule,
  listAlertRules,
  updateAlertRule,
  type AlertRule,
  type AlertSeverity,
  type ConditionOperator,
} from "../lib/api/alerts";
import { ApiError } from "../lib/api/client";

const CONDITION_OPERATORS: ConditionOperator[] = ["gt", "gte", "lt", "lte", "eq"];
const SEVERITIES: AlertSeverity[] = ["info", "warning", "critical"];

// Mirrors `CreateAlertRuleRequest`/`UpdateAlertRuleRequest`
// (`backend/app/modules/alerts/schemas.py`). `metric_name` and
// `condition_operator` are both part of this shared schema because
// create needs them, but the edit form renders them as disabled inputs
// and `AlertRulesTab`'s edit submit handler below never sends them to
// `updateAlertRule` -- the backend's `UpdateAlertRuleRequest` has no
// fields for either, only `CreateAlertRuleRequest` does.
const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  metric_name: z.string().min(1, "Metric name is required").max(100),
  condition_operator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  threshold: z.number(),
  window_seconds: z.number().int().min(10).max(86400),
  severity: z.enum(["info", "warning", "critical"]),
  is_enabled: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const EMPTY_VALUES: FormValues = {
  name: "",
  metric_name: "",
  condition_operator: "gt",
  threshold: 0,
  window_seconds: 300,
  severity: "warning",
  is_enabled: true,
};

function toFormValues(rule: AlertRule): FormValues {
  return {
    name: rule.name,
    metric_name: rule.metric_name,
    condition_operator: rule.condition_operator,
    threshold: rule.threshold,
    window_seconds: rule.window_seconds,
    severity: rule.severity,
    is_enabled: rule.is_enabled,
  };
}

interface AlertRuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialValues?: AlertRule;
  onSubmit: (values: FormValues) => Promise<void>;
}

function AlertRuleFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSubmit,
}: AlertRuleFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_VALUES,
  });

  // Re-seed the form whenever the dialog opens, same as `ServiceFormDialog`:
  // this dialog instance is reused across repeated opens for different rows.
  useEffect(() => {
    if (open) {
      reset(initialValues ? toFormValues(initialValues) : EMPTY_VALUES);
    }
  }, [open, initialValues, reset]);

  async function submit(values: FormValues) {
    try {
      await onSubmit(values);
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
            {mode === "create" ? "New alert rule" : "Edit alert rule"}
          </Dialog.Title>

          <form onSubmit={handleSubmit(submit)} noValidate className="mt-4 space-y-4">
            <div className="space-y-1">
              <label htmlFor="rule-name" className="block text-sm">
                Name
              </label>
              <input
                id="rule-name"
                className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("name")}
              />
              {errors.name && <p className="text-sm text-critical">{errors.name.message}</p>}
            </div>

            {/*
              `metric_name`/`condition_operator` can only be set at
              creation -- `UpdateAlertRuleRequest` in
              `backend/app/modules/alerts/schemas.py` has no fields for
              either. Rather than silently dropping whatever the user types
              here on edit, disable both inputs so it's visible that they
              can't be changed after the rule is created.
            */}
            <div className="space-y-1">
              <label htmlFor="rule-metric-name" className="block text-sm">
                Metric name
              </label>
              <input
                id="rule-metric-name"
                disabled={mode === "edit"}
                className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink disabled:opacity-60"
                {...register("metric_name")}
              />
              {errors.metric_name && (
                <p className="text-sm text-critical">{errors.metric_name.message}</p>
              )}
              {mode === "edit" && (
                <p className="text-xs text-ink/60">Set at creation; cannot be changed.</p>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="rule-condition" className="block text-sm">
                  Condition
                </label>
                <select
                  id="rule-condition"
                  disabled={mode === "edit"}
                  className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink disabled:opacity-60"
                  {...register("condition_operator")}
                >
                  {CONDITION_OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 space-y-1">
                <label htmlFor="rule-threshold" className="block text-sm">
                  Threshold
                </label>
                <input
                  id="rule-threshold"
                  type="number"
                  step="any"
                  className="w-full rounded border border-hairline bg-bg px-3 py-2 font-mono text-ink"
                  {...register("threshold", { valueAsNumber: true })}
                />
                {errors.threshold && (
                  <p className="text-sm text-critical">{errors.threshold.message}</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="rule-window" className="block text-sm">
                  Window (seconds)
                </label>
                <input
                  id="rule-window"
                  type="number"
                  className="w-full rounded border border-hairline bg-bg px-3 py-2 font-mono text-ink"
                  {...register("window_seconds", { valueAsNumber: true })}
                />
                {errors.window_seconds && (
                  <p className="text-sm text-critical">{errors.window_seconds.message}</p>
                )}
              </div>

              <div className="flex-1 space-y-1">
                <label htmlFor="rule-severity" className="block text-sm">
                  Severity
                </label>
                <select
                  id="rule-severity"
                  className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
                  {...register("severity")}
                >
                  {SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>
                      {severity}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="rule-enabled"
                type="checkbox"
                className="h-4 w-4"
                {...register("is_enabled")}
              />
              <label htmlFor="rule-enabled" className="text-sm">
                Enabled
              </label>
            </div>

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
                {mode === "create" ? "Create rule" : "Save changes"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface AlertRulesTabProps {
  orgId: string;
  serviceId: string;
}

export function AlertRulesTab({ orgId, serviceId }: AlertRulesTabProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { open: false }
    | { open: true; mode: "create" }
    | { open: true; mode: "edit"; rule: AlertRule }
  >({ open: false });

  const queryKey = ["alert-rules", orgId, serviceId];
  const {
    data: rules,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listAlertRules(orgId, serviceId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey });
  }

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createAlertRule(orgId, serviceId, {
        name: values.name,
        metric_name: values.metric_name,
        condition_operator: values.condition_operator,
        threshold: values.threshold,
        window_seconds: values.window_seconds,
        severity: values.severity,
        is_enabled: values.is_enabled,
      }),
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ ruleId, values }: { ruleId: string; values: FormValues }) =>
      // `metric_name`/`condition_operator` are intentionally left out here:
      // `UpdateAlertRuleRequest` doesn't accept them, so sending them would
      // either be ignored or rejected by the backend.
      updateAlertRule(orgId, serviceId, ruleId, {
        name: values.name,
        threshold: values.threshold,
        window_seconds: values.window_seconds,
        severity: values.severity,
        is_enabled: values.is_enabled,
      }),
    // `onSettled`, not `onSuccess`: a 404 here means someone else already
    // deleted this rule since the list was fetched, so the table needs to
    // drop the row on Cancel, not just show the dialog's error.
    onSettled: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteAlertRule(orgId, serviceId, ruleId),
    onError: (err) => {
      // A 404 here means someone else already deleted this rule (a stale
      // row in our list); surface it and let `onSettled` refetch so the
      // table reflects reality instead of keeping a row we just acted on.
      setActionError(
        err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      );
    },
    onSuccess: () => setActionError(null),
    onSettled: () => invalidate(),
  });

  async function handleCreate(values: FormValues) {
    await createMutation.mutateAsync(values);
  }

  async function handleEdit(rule: AlertRule, values: FormValues) {
    await updateMutation.mutateAsync({ ruleId: rule.id, values });
  }

  function handleDelete(rule: AlertRule) {
    deleteMutation.mutate(rule.id);
  }

  if (isLoading) {
    return <p className="text-sm text-ink">Loading alert rules...</p>;
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-critical">Failed to load alert rules.</p>
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

  const items = rules ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Alert rules</h3>
        <button
          type="button"
          onClick={() => setDialogState({ open: true, mode: "create" })}
          className="rounded bg-accent-blue px-3 py-2 text-sm text-ink"
        >
          New rule
        </button>
      </div>

      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-ink">No alert rules yet. Create one to get started.</p>
      ) : (
        <table className="w-full border-collapse text-sm text-ink">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Metric</th>
              <th className="py-2 pr-4 font-medium">Condition</th>
              <th className="py-2 pr-4 font-medium">Window</th>
              <th className="py-2 pr-4 font-medium">Severity</th>
              <th className="py-2 pr-4 font-medium">Enabled</th>
              <th className="py-2 pr-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((rule) => (
              <tr key={rule.id} className="border-b border-hairline">
                <td className="py-2 pr-4">{rule.name}</td>
                <td className="py-2 pr-4 font-mono">{rule.metric_name}</td>
                <td className="py-2 pr-4 font-mono">
                  {rule.condition_operator} {rule.threshold}
                </td>
                <td className="py-2 pr-4 font-mono">{rule.window_seconds}s</td>
                <td className="py-2 pr-4 font-mono">{rule.severity}</td>
                <td className="py-2 pr-4">{rule.is_enabled ? "Yes" : "No"}</td>
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDialogState({ open: true, mode: "edit", rule })}
                      className="rounded border border-hairline px-2 py-1 text-xs text-ink"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule)}
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
      )}

      <AlertRuleFormDialog
        open={dialogState.open}
        mode={dialogState.open ? dialogState.mode : "create"}
        initialValues={dialogState.open && dialogState.mode === "edit" ? dialogState.rule : undefined}
        onOpenChange={(open) => {
          if (!open) setDialogState({ open: false });
        }}
        onSubmit={(values) => {
          if (dialogState.open && dialogState.mode === "edit") {
            return handleEdit(dialogState.rule, values);
          }
          return handleCreate(values);
        }}
      />
    </div>
  );
}

export default AlertRulesTab;

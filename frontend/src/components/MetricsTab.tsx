import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createMetric, listMetrics } from "../lib/api/metrics";
import { ApiError } from "../lib/api/client";

const PAGE_LIMIT = 20;

// Mirrors `IngestMetricRequest` (`backend/app/modules/metrics/schemas.py`).
// `unit` and `recorded_at` are both optional there, so empty strings here
// are treated as "not provided" rather than sent as empty values -- see
// `createMutation`'s `mutationFn` below.
const formSchema = z.object({
  metric_name: z.string().min(1, "Metric name is required").max(100),
  value: z.number().refine((v) => !Number.isNaN(v), { message: "Value is required" }),
  unit: z.string().max(32).optional(),
  recorded_at: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const EMPTY_VALUES: FormValues = {
  metric_name: "",
  value: Number.NaN,
  unit: "",
  recorded_at: "",
};

// A `datetime-local` input yields "2026-01-01T12:00" with no timezone --
// append seconds and treat it as local time, which `new Date(...)`
// converts to a proper ISO/UTC string the backend's `datetime` field can
// parse.
function toRecordedAt(localDateTime: string): string | undefined {
  if (!localDateTime) return undefined;
  const date = new Date(localDateTime);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export interface MetricsTabProps {
  orgId: string;
  serviceId: string;
}

export function MetricsTab({ orgId, serviceId }: MetricsTabProps) {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);

  const queryKey = ["metrics", orgId, serviceId, PAGE_LIMIT, offset];
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listMetrics(orgId, serviceId, { limit: PAGE_LIMIT, offset }),
  });

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

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createMetric(orgId, serviceId, {
        metric_name: values.metric_name,
        value: values.value,
        unit: values.unit ? values.unit : undefined,
        recorded_at: toRecordedAt(values.recorded_at ?? ""),
      }),
    onSuccess: () => {
      reset(EMPTY_VALUES);
      void queryClient.invalidateQueries({ queryKey: ["metrics", orgId, serviceId] });
    },
    onError: (err) => {
      setError("metric_name", {
        message: err instanceof ApiError ? err.detail : "Something went wrong. Please try again.",
      });
    },
  });

  async function submit(values: FormValues) {
    try {
      await createMutation.mutateAsync(values);
    } catch {
      // Already surfaced via `createMutation`'s `onError` (sets a field
      // error on the form); nothing further to do here.
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + PAGE_LIMIT < total;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-ink">Record a snapshot</h3>
        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <label htmlFor="metric-name" className="block text-sm">
                Metric name
              </label>
              <input
                id="metric-name"
                className="rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("metric_name")}
              />
              {errors.metric_name && (
                <p className="text-sm text-critical">{errors.metric_name.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="metric-value" className="block text-sm">
                Value
              </label>
              <input
                id="metric-value"
                type="number"
                step="any"
                className="w-32 rounded border border-hairline bg-bg px-3 py-2 font-mono text-ink"
                {...register("value", { valueAsNumber: true })}
              />
              {errors.value && <p className="text-sm text-critical">{errors.value.message}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="metric-unit" className="block text-sm">
                Unit (optional)
              </label>
              <input
                id="metric-unit"
                className="w-32 rounded border border-hairline bg-bg px-3 py-2 text-ink"
                {...register("unit")}
              />
              {errors.unit && <p className="text-sm text-critical">{errors.unit.message}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="metric-recorded-at" className="block text-sm">
                Recorded at (optional)
              </label>
              <input
                id="metric-recorded-at"
                type="datetime-local"
                className="rounded border border-hairline bg-bg px-3 py-2 font-mono text-ink"
                {...register("recorded_at")}
              />
              <p className="text-xs text-ink/60">Leave blank to record it as now.</p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-accent-blue px-3 py-2 text-sm text-ink disabled:opacity-60"
          >
            Record snapshot
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-ink">Metric snapshots</h3>

        {isLoading ? (
          <p className="text-sm text-ink">Loading metrics...</p>
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-critical">Failed to load metrics.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded border border-hairline px-3 py-2 text-sm text-ink"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink">No metric snapshots yet.</p>
        ) : (
          <>
            <table className="w-full border-collapse text-sm text-ink">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="py-2 pr-4 font-medium">Metric</th>
                  <th className="py-2 pr-4 font-medium">Value</th>
                  <th className="py-2 pr-4 font-medium">Unit</th>
                  <th className="py-2 pr-4 font-medium">Recorded at</th>
                </tr>
              </thead>
              <tbody>
                {items.map((snapshot) => (
                  <tr key={snapshot.id} className="border-b border-hairline">
                    <td className="py-2 pr-4">{snapshot.metric_name}</td>
                    <td className="py-2 pr-4 font-mono">{snapshot.value}</td>
                    <td className="py-2 pr-4 font-mono">{snapshot.unit ?? ""}</td>
                    <td className="py-2 pr-4 font-mono">{snapshot.recorded_at}</td>
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
      </div>
    </div>
  );
}

export default MetricsTab;

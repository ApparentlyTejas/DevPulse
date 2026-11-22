import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { generatePostmortem, listPostmortems, type Postmortem } from "../lib/api/ai";
import { ApiError } from "../lib/api/client";

export interface PostmortemPanelProps {
  orgId: string;
  incidentId: string;
}

// Same split as `TriageHistory`'s `describeRunTriageError`: the shared
// per-org AI budget being exhausted (429, `Retry-After`-bearing, via
// `rate_limit_by_org`) needs its own message, distinct from the Claude call
// itself failing (502, `AITriageError` -> `detail=f"Postmortem generation
// failed: {exc}"`) and from everything else.
function describeGeneratePostmortemError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return err.retryAfterSeconds != null
        ? `Postmortem generation is rate-limited for this organization. Try again in ${err.retryAfterSeconds} seconds.`
        : "Postmortem generation is rate-limited for this organization. Try again shortly.";
    }
    return err.detail;
  }
  return "Something went wrong. Please try again.";
}

// No typography plugin is configured for Tailwind here, so markdown
// elements get explicit classes using the design tokens rather than relying
// on a "prose" utility class.
const markdownComponents: Components = {
  h2: (props) => <h2 className="mt-4 text-sm font-medium text-ink" {...props} />,
  h3: (props) => <h3 className="mt-3 text-sm font-medium text-ink" {...props} />,
  p: (props) => <p className="text-sm text-ink" {...props} />,
  ul: (props) => <ul className="list-disc space-y-1 pl-5 text-sm text-ink" {...props} />,
  ol: (props) => <ol className="list-decimal space-y-1 pl-5 text-sm text-ink" {...props} />,
  li: (props) => <li className="text-sm text-ink" {...props} />,
  code: (props) => <code className="font-mono text-xs text-ink" {...props} />,
};

function latestPostmortem(postmortems: Postmortem[]): Postmortem | null {
  if (postmortems.length === 0) {
    return null;
  }
  return [...postmortems].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export function PostmortemPanel({ orgId, incidentId }: PostmortemPanelProps) {
  const queryClient = useQueryClient();
  const [generateError, setGenerateError] = useState<string | null>(null);

  const queryKey = ["postmortems", orgId, incidentId];
  const {
    data: postmortems,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => listPostmortems(orgId, incidentId),
  });

  const generateMutation = useMutation({
    mutationFn: () => generatePostmortem(orgId, incidentId),
    onError: (err) => setGenerateError(describeGeneratePostmortemError(err)),
    onSuccess: (postmortem) => {
      setGenerateError(null);
      queryClient.setQueryData<Postmortem[]>(queryKey, (prev) => [postmortem, ...(prev ?? [])]);
    },
  });

  if (isLoading) {
    return <p className="text-sm text-ink">Loading postmortem...</p>;
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-critical">Failed to load postmortem.</p>
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

  const latest = latestPostmortem(postmortems ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">Postmortem</h3>
        <button
          type="button"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="rounded border border-hairline px-3 py-2 text-sm text-ink disabled:opacity-60"
        >
          {generateMutation.isPending ? "Generating postmortem..." : "Generate postmortem"}
        </button>
      </div>

      {generateError && <p className="text-sm text-critical">{generateError}</p>}

      {latest === null ? (
        <p className="text-sm text-ink">No postmortem generated yet.</p>
      ) : (
        <div data-testid="postmortem-content" className="space-y-2 text-sm text-ink">
          <p className="font-mono text-xs text-ink/60">
            {latest.created_at} · Model: <span className="font-mono">{latest.model}</span>
          </p>
          <div className="space-y-2">
            <ReactMarkdown components={markdownComponents}>{latest.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export default PostmortemPanel;

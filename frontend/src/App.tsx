import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { ApiError } from "./lib/api/client";
import { AuthProvider } from "./lib/auth-context";
import { OrgProvider } from "./lib/org-context";
import { router } from "./routes";

// TanStack Query's default retry policy (3 retries with backoff, ~7s
// total) treats a 404 the same as a transient network blip, so a
// not-found page shows "Loading..." for ~7s before the real empty state
// appears. 4xx errors are the server telling us the request itself is
// wrong -- retrying won't change that -- so only 5xx/network errors (no
// `ApiError`, or `status >= 500`) get retried, and only up to twice.
// Exported so `App.test.tsx` can exercise the real retry policy directly
// (via `fetchQuery`) instead of a copy that could silently drift from
// what production actually uses.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OrgProvider>
          <RouterProvider router={router} />
        </OrgProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

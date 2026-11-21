import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./lib/auth-context";
import { OrgProvider } from "./lib/org-context";
import { router } from "./routes";

const queryClient = new QueryClient();

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

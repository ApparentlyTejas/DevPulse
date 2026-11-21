import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { IncidentsListPage } from "./pages/IncidentsListPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ServiceDetailPage } from "./pages/ServiceDetailPage";
import { ServicesListPage } from "./pages/ServicesListPage";

// `/login` and `/register` are public; everything else renders inside
// `AppLayout`, which redirects to `/login` when there's no authenticated
// user. Later tasks each add their own child route here -- for now there's
// a placeholder landing page plus `/services` and `/incidents`.
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <div className="text-sm text-ink">Welcome to DevPulse.</div>,
      },
      { path: "services", element: <ServicesListPage /> },
      { path: "services/:id", element: <ServiceDetailPage /> },
      { path: "incidents", element: <IncidentsListPage /> },
    ],
  },
]);

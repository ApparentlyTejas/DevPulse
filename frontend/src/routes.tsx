import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { IncidentDetailPage } from "./pages/IncidentDetailPage";
import { IncidentsListPage } from "./pages/IncidentsListPage";
import { LoginPage } from "./pages/LoginPage";
import { MembersPage } from "./pages/MembersPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ServiceDetailPage } from "./pages/ServiceDetailPage";
import { ServicesListPage } from "./pages/ServicesListPage";

// `/login` and `/register` are public; everything else renders inside
// `AppLayout`, which redirects to `/login` when there's no authenticated
// user. `/` is the dashboard; `/services` and `/incidents` etc. are the
// other top-level pages it summarizes.
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      { path: "services", element: <ServicesListPage /> },
      { path: "services/:id", element: <ServiceDetailPage /> },
      { path: "incidents", element: <IncidentsListPage /> },
      { path: "incidents/:id", element: <IncidentDetailPage /> },
      { path: "members", element: <MembersPage /> },
    ],
  },
]);

import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";

// `/login` and `/register` are public; everything else renders inside
// `AppLayout`, which redirects to `/login` when there's no authenticated
// user. Later tasks each add their own child route here (e.g. `/incidents`,
// `/services`) -- for now there's just a placeholder landing page.
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
    ],
  },
]);

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../lib/api/client";
import { useAuth } from "../lib/auth-context";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg font-sans text-ink">
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="w-full max-w-sm space-y-4 rounded border border-hairline bg-surface p-8"
      >
        <h1 className="text-lg font-medium">Sign in</h1>

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-critical">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded border border-hairline bg-bg px-3 py-2 text-ink"
            {...register("password")}
          />
          {errors.password && <p className="text-sm text-critical">{errors.password.message}</p>}
        </div>

        {error && <p className="text-sm text-critical">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-accent-blue px-3 py-2 text-ink disabled:opacity-60"
        >
          Sign in
        </button>

        <p className="text-sm">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="text-accent-blue">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}

export default LoginPage;

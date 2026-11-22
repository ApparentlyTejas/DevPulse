import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../lib/api/client";
import { useAuth } from "../lib/auth-context";

// Matches the backend's `RegisterRequest` constraints
// (`backend/app/modules/auth/schemas.py`): email + an 8-128 char password.
const registerSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterFormValues) {
    setError(null);
    try {
      await registerUser(values.email, values.password);
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
        <h1 className="text-lg font-medium">Create an account</h1>

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
            autoComplete="new-password"
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
          Create account
        </button>

        <p className="text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-accent-blue">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

export default RegisterPage;

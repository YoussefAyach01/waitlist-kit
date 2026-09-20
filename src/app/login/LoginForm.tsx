"use client";
import { useActionState } from "react";
import { login } from "../actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, "");
  return (
    <form action={action} className="card space-y-3">
      <label htmlFor="password" className="block text-sm font-semibold">
        Admin password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="field"
        aria-describedby={error ? "login-err" : undefined}
      />
      {error && (
        <p id="login-err" role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

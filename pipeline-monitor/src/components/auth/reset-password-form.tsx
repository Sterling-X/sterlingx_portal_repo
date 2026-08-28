"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      setError("Missing or invalid reset link.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = (await res.json()) as { error?: string };
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Something went wrong.");
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <p className="mt-4 text-sm text-red-400">
        This link is missing its reset token. Request a new one from the{" "}
        <a href="/forgot-password" className="underline">
          forgot password
        </a>{" "}
        page.
      </p>
    );
  }

  if (done) {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-sm text-white/70">
          Password updated. You can sign in now.
        </p>
        <a
          href="/login"
          className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-500"
        >
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-white/70">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm text-white/70">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          required
          minLength={10}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}

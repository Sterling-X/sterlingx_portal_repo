import { LoginForm } from "@/components/auth/login-form";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Pipeline Monitor</h1>
        <p className="mb-6 text-sm text-white/60">
          Sign in to view offline-conversion pipeline health.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <a
          href="/forgot-password"
          className="mt-4 block text-center text-sm text-white/50 hover:text-white/80"
        >
          Forgot password?
        </a>
      </div>
    </div>
  );
}

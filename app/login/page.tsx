import { Suspense } from "react";
import LoginForm from "./login-form";

// Phase-2a login: static-safe server shell (no cookie/data reads here — the
// client form POSTs to /api/auth/otp and links to /api/auth/google).
export const metadata = {
  title: "Log in — Arena",
  description: "Log in with a magic email link or Google to sync your progress across devices.",
};

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Account</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">Log in to Arena</h1>
      <p className="mt-2 text-sm text-zinc-400">
        One login keeps your progress, VIP, and family in sync on every device.
      </p>
      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

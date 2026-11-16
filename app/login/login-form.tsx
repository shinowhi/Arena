"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";
import { readApiError } from "@/lib/scan/image-prep";

// Phase-2a login form (client island). PKCE fix: the Supabase Auth calls
// (signInWithOtp + signInWithOAuth) run DIRECTLY in this browser via the
// cookie-based auth-browser client, so the PKCE code_verifier lands in THIS
// browser's cookies and /auth/callback can exchange it. Calling them from an
// API route instead sets the verifier on the server's response — never in
// the browser — so the callback exchange always failed (/login?err=1).
//
// Redirect targets use window.location.origin: safe because an attacker
// cannot change another browser's own origin (no open redirect — the URL is
// built locally, not from request input).
//
// Role threading: the select only matters on first link (it becomes the
// auth_links role); re-logins ignore it. OTP path stashes the role in the
// HttpOnly arena_pending_role cookie via /api/auth/otp-request (same-browser
// only — a magic link opened on ANOTHER device drops the role and lands on
// student). Google path threads ?role= through redirectTo instead; the
// pending cookie is OTP-path-only. The callback prefers ?role=, then the
// pending cookie, then student.
const ROLES = [
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
  { value: "teacher", label: "Teacher" },
];
const VALID_ROLES = new Set(ROLES.map((r) => r.value));

export default function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const errParam = params.get("err");
  const [error, setError] = useState(
    errParam === "claimed"
      ? "That device progress belonged to another account."
      : errParam === "exchange"
        ? "This login link expired or was already used — request a fresh one below."
        : errParam === "nouser"
          ? "Login session unreadable — please try again."
          : errParam === "link" || (errParam !== null && errParam.startsWith("link-"))
            ? "Account setup hiccup — please try again."
            : errParam
              ? "Login failed — please try again."
              : "",
  );

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Precheck FIRST: rate limits (IP + per-address) + pending-role cookie.
      // Only on {ok:true} do we ask Supabase to send the email.
      const pre = await fetch("/api/auth/otp-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!pre.ok) throw new Error(await readApiError(pre, "Could not send the login email."));
      const auth = createAuthBrowserClient();
      const { error: otpError } = await auth.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (otpError) throw new Error(otpError.message);
      setSent(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Could not send the login email.");
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setGoogleBusy(true);
    setError("");
    try {
      const safeRole = VALID_ROLES.has(role) ? role : "student";
      const auth = createAuthBrowserClient();
      // signInWithOAuth redirects this browser to the provider itself (unless
      // skipBrowserRedirect is set) — nothing to do on success but wait.
      const { error: oauthError } = await auth.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?role=${safeRole}` },
      });
      if (oauthError) throw new Error(oauthError.message);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Google login failed — please try again.");
      setGoogleBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-950/40 p-4 text-sm text-zinc-200">
          {error}
        </p>
      ) : null}
      {sent ? (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm font-semibold text-zinc-100">Check your email</p>
          <p className="mt-1 text-sm text-zinc-400">
            We sent a login link to <span className="font-semibold text-zinc-200">{email}</span>.
            Open it on this device to finish logging in.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-3 rounded-full border border-zinc-700 px-5 py-2 text-sm font-bold text-zinc-200"
          >
            Use a different email
          </button>
        </section>
      ) : (
        <form
          onSubmit={(e) => void sendLink(e)}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
        >
          <label htmlFor="login-email" className="text-sm font-semibold text-zinc-200">
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600"
          />
          <label htmlFor="login-role" className="mt-4 block text-sm font-semibold text-zinc-200">
            I am a…
          </label>
          <select
            id="login-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-zinc-100"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy || email.trim().length === 0}
            className="mt-4 w-full rounded-full bg-emerald-600 px-6 py-3 font-bold text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send login link"}
          </button>
        </form>
      )}
      <div className="mt-4 flex items-center gap-3 text-xs font-bold tracking-widest text-zinc-500 uppercase">
        <span className="h-px flex-1 bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-800" />
      </div>
      <button
        type="button"
        onClick={() => void continueWithGoogle()}
        disabled={googleBusy}
        className="mt-4 block w-full rounded-full border border-zinc-700 bg-zinc-900 px-6 py-3 text-center font-bold text-zinc-100 disabled:opacity-40"
      >
        {googleBusy ? "Redirecting to Google…" : "Continue with Google"}
      </button>
      <p className="mt-4 text-center text-xs text-zinc-500">
        Logging in links this device&apos;s progress to your account.
      </p>
    </div>
  );
}

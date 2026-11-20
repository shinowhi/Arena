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
  { value: "student", label: "Học sinh" },
  { value: "parent", label: "Phụ huynh" },
  { value: "teacher", label: "Giáo viên" },
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
      ? "Tiến độ của thiết bị này thuộc về tài khoản khác."
      : errParam === "exchange"
        ? "Link đăng nhập đã hết hạn hoặc đã dùng — xin link mới bên dưới."
        : errParam === "nouser"
          ? "Không đọc được phiên đăng nhập — thử lại giúp mình."
          : errParam === "link" || (errParam !== null && errParam.startsWith("link-"))
            ? "Lỗi tạo tài khoản — tải lại trang và xin link đăng nhập mới."
            : errParam
              ? "Đăng nhập thất bại — thử lại giúp mình."
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
      if (!pre.ok) throw new Error(await readApiError(pre, "Không gửi được email đăng nhập."));
      const auth = createAuthBrowserClient();
      const { error: otpError } = await auth.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (otpError) throw new Error(otpError.message);
      setSent(true);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Không gửi được email đăng nhập.");
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
      setError(e2 instanceof Error ? e2.message : "Đăng nhập Google thất bại — thử lại giúp mình.");
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
          <p className="text-sm font-semibold text-zinc-100">Kiểm tra email</p>
          <p className="mt-1 text-sm text-zinc-400">
            Đã gửi link đăng nhập tới <span className="font-semibold text-zinc-200">{email}</span>.
            Mở link trên thiết bị này để đăng nhập xong.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-3 cursor-pointer rounded-full border border-zinc-700 px-5 py-2 text-sm font-bold text-zinc-200"
          >
            Dùng email khác
          </button>
        </section>
      ) : (
        <form
          onSubmit={(e) => void sendLink(e)}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
        >
          <label htmlFor="login-email" className="text-sm font-semibold text-zinc-200">
            Địa chỉ email
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
            Tôi là…
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
            className="arena-btn-primary mt-4 w-full cursor-pointer rounded-full px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Đang gửi…" : "Gửi link đăng nhập"}
          </button>
        </form>
      )}
      <div className="mt-4 flex items-center gap-3 text-xs font-medium text-zinc-500">
        <span className="h-px flex-1 bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-800" />
      </div>
      <button
        type="button"
        onClick={() => void continueWithGoogle()}
        disabled={googleBusy}
        className="arena-btn-ghost mt-4 block w-full cursor-pointer rounded-full px-6 py-3 text-center font-bold text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {googleBusy ? "Đang chuyển sang Google…" : "Tiếp tục với Google"}
      </button>
      <p className="mt-4 text-center text-xs text-zinc-500">
        Đăng nhập sẽ gắn tiến độ của thiết bị này vào tài khoản của bạn.
      </p>
    </div>
  );
}

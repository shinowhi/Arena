import { Suspense } from "react";
import LoginForm from "./login-form";

// Phase-2a login: static-safe server shell (no cookie/data reads here — the
// client form prechecks via /api/auth/otp-request, then calls Supabase Auth
// directly in the browser so the PKCE verifier lands in browser cookies).
export const metadata = {
  title: "Đăng nhập — BossLearn",
  description: "Đăng nhập bằng link email hoặc Google để đồng bộ tiến độ giữa các thiết bị.",
};

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-extrabold text-zinc-100">
        Đăng nhập <span translate="no">BossLearn</span>
      </h1>
      <p className="mt-2 text-sm text-zinc-400">
        Một tài khoản giữ tiến độ, VIP và gia đình của bạn đồng bộ trên mọi thiết bị.
      </p>
      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Đang tải…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

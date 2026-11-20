import { Suspense } from "react";
import Link from "next/link";
import { createAuthClient } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { SUPPORT_CONTACT } from "@/lib/auth/support";
import MeActions from "./me-actions";

// Phase-2a account page (server shell + Suspense like /vip: the status block
// reads cookies, so it streams inside Suspense). Shows the login email, the
// linked player, and the role; the client island owns export/delete/logout.

export const metadata = {
  title: "Tài khoản — BossLearn",
  description: "Đăng nhập, tiến độ đã liên kết, tải dữ liệu và xóa tài khoản.",
};

type MeStatus = {
  authed: boolean;
  email: string | null;
  playerId: string | null;
  role: string | null;
};

async function loadStatus(): Promise<MeStatus> {
  const out: MeStatus = { authed: false, email: null, playerId: null, role: null };
  try {
    const auth = await createAuthClient();
    const user = await getAuthUser(auth);
    if (!user) return out;
    out.authed = true;
    out.email = user.email;
    const supabase = await createClient();
    const r = await supabase
      .from("auth_links")
      .select("player_id, role")
      .eq("auth_user_id", user.id)
      .limit(1);
    if (r.error || !Array.isArray(r.data) || r.data.length === 0) return out;
    const link = r.data[0] as { player_id: string; role: string };
    out.playerId = link.player_id;
    out.role = link.role;
    return out;
  } catch {
    return out;
  }
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

async function AccountStatus() {
  const s = await loadStatus();
  if (!s.authed) {
    return (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Bạn đang dùng ẩn danh</p>
        <p className="mt-1 text-sm text-zinc-400">
          Đăng nhập để đồng bộ tiến độ giữa các thiết bị và quản lý dữ liệu.
        </p>
        <Link
          href="/login"
          className="arena-btn-primary mt-4 inline-block rounded-full px-6 py-2.5 font-bold text-white"
        >
          Đăng nhập
        </Link>
      </section>
    );
  }
  return (
    <>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-zinc-400">Email</dt>
            <dd className="font-semibold break-all text-zinc-100">{s.email ?? "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-zinc-400">Nhân vật đã liên kết</dt>
            <dd className="font-mono font-semibold text-zinc-100">
              {s.playerId ? shortId(s.playerId) : "chưa liên kết"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-zinc-400">Vai trò</dt>
            <dd className="font-semibold text-zinc-100">
              {s.role === "student" ? "Học sinh" : s.role === "parent" ? "Phụ huynh" : s.role === "teacher" ? "Giáo viên" : "—"}
            </dd>
          </div>
        </dl>
        {s.role === "parent" ? (
          <p className="mt-4 text-sm text-zinc-400">
            Quản lý các con và xác nhận phụ huynh tại{" "}
            <Link href="/family" className="font-semibold text-cyan-300 underline hover:text-white">
              trang Gia đình
            </Link>
            .
          </p>
        ) : null}
      </section>
      <MeActions />
    </>
  );
}

export default function MePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-2xl font-extrabold text-zinc-100">Tài khoản của tôi</h1>

      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Đang tải tài khoản…</p>}>
        <AccountStatus />
      </Suspense>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Dữ liệu của bạn, bạn quyết</p>
        <p className="mt-1 text-sm text-zinc-400">
          Tải về mọi thứ gắn với tài khoản của bạn trong một file JSON. Xóa sẽ xóa tiến độ học,
          liên kết gia đình và đăng nhập — hầu hết ngay lập tức, phần cần dọn thủ công trong vòng
          72 giờ sau yêu cầu. Thắc mắc? Email {SUPPORT_CONTACT}.
        </p>
      </section>
    </main>
  );
}

import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAdmin } from "@/lib/game/player-sign";
import CodesForm from "./codes-form";

// Admin funnel dashboard (server component: every query runs server-side).
// No ADMIN_SECRET -> "not configured". No valid arena_admin cookie -> key
// form that posts to /api/admin/login. Only counts and statuses render here
// — events carry no answers or keys (see lib/funnel.ts).
const EVENTS = [
  "scan_started",
  "scan_completed",
  "boss_summoned",
  "boss_killed",
  "exam_started",
  "exam_graded",
  "duel_created",
  "duel_finished",
  "royale_joined",
  "essay_graded",
  "tutor_asked",
];

const FUNNEL = ["scan_started", "scan_completed", "boss_summoned", "boss_killed", "exam_started"];

type RecentRow = {
  id: string;
  player_id: string | null;
  event: string;
  meta: unknown;
  created_at: string;
};

type VipCode = {
  code: string;
  max_uses: number;
  used: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-amber-400">Quản trị</p>
          <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">{title}</h1>
        </div>
        <nav className="flex shrink-0 gap-4 text-sm" aria-label="Quản trị">
          <a href="/admin/billing" className="text-amber-400 underline hover:text-amber-300">Quầy thanh toán</a>
          <a href="/admin/centers" className="text-amber-400 underline hover:text-amber-300">Trung tâm</a>
        </nav>
      </div>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </main>
  );
}

// Module-level loader (kept out of the component so render stays pure).
async function loadDashboard(): Promise<{
  c7: Map<string, number>;
  c30: Map<string, number>;
  recent: RecentRow[];
  missing: boolean;
  codes: VipCode[];
  vipMissing: boolean;
}> {
  const supabase = await createClient();
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  async function count(event: string, since: string): Promise<number | null> {
    const r = await supabase
      .from("funnel_events")
      .select("id", { count: "exact", head: true })
      .eq("event", event)
      .gte("created_at", since);
    return r.error ? null : (r.count ?? 0);
  }
  const pairs = await Promise.all(
    EVENTS.map(async (e) => [e, await count(e, since7), await count(e, since30)] as const),
  );
  const missing = pairs.some(([, a, b]) => a === null || b === null);
  const c7 = new Map(pairs.map(([e, a]) => [e, a ?? 0]));
  const c30 = new Map(pairs.map(([e, , b]) => [e, b ?? 0]));
  let recent: RecentRow[] = [];
  if (!missing) {
    const r = await supabase
      .from("funnel_events")
      .select("id, player_id, event, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!r.error && Array.isArray(r.data)) recent = r.data as RecentRow[];
  }
  // P2 VIP inventory via definer RPC (vip_codes is deny-all for anon).
  // Service-role client: EXECUTE on admin_* is revoked from every public
  // role (0012). Safe: this loader only runs after verifyAdmin passes.
  let codes: VipCode[] = [];
  let vipMissing = false;
  {
    let rows: VipCode[] | null = null;
    try {
      const r = await createServiceClient().rpc("admin_list_codes");
      if (!r.error && Array.isArray(r.data)) rows = r.data as VipCode[];
    } catch {
      rows = null;
    }
    if (!rows) vipMissing = true;
    else codes = rows;
  }
  return { c7, c30, recent, missing, codes, vipMissing };
}

// Everything below the Shell reads cookies/searchParams/DB, so it streams
// inside Suspense (Next 16 cacheComponents forbids dynamic reads in prerender).
async function AdminBody({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const store = await cookies();
  if (!verifyAdmin(store.get("arena_admin")?.value)) {
    const { err } = await searchParams;
    return (
      <form
        method="POST"
        action="/api/admin/login"
        className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"
      >
        <label className="block text-xs text-zinc-400">
          Khóa quản trị
          <input
            type="password"
            name="key"
            autoComplete="off"
            className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        {err && <p role="alert" className="mt-2 text-sm text-red-400">Sai khóa — thử lại.</p>}
        <button
          type="submit"
          className="arena-btn-primary mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-bold text-white"
        >
          Mở khóa
        </button>
      </form>
    );
  }

  const { c7, c30, recent, missing, codes, vipMissing } = await loadDashboard();

  return (
    <>
      {missing && (
        <p className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Chưa có dữ liệu phễu — chạy migration supabase/migrations/0011_funnel.sql trong Supabase,
          sự kiện sẽ hiện ở đây.
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Sự kiện (7 ngày / 30 ngày)</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 font-semibold">Sự kiện</th>
              <th className="py-1 text-right font-semibold">7d</th>
              <th className="py-1 text-right font-semibold">30d</th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((e) => (
              <tr key={e} className="border-t border-zinc-800 text-zinc-300">
                <td className="py-1.5 font-mono text-xs">{e}</td>
                <td className="py-1.5 text-right tabular-nums">{c7.get(e)}</td>
                <td className="py-1.5 text-right tabular-nums">{c30.get(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Tỉ lệ chuyển đổi phễu (30 ngày)</h2>
        <ol className="mt-3 space-y-1.5 text-sm">
          {FUNNEL.map((e, i) => {
            const n = c30.get(e) ?? 0;
            const prev = i === 0 ? null : (c30.get(FUNNEL[i - 1]) ?? 0);
            const pct = prev === null ? null : prev > 0 ? `${Math.round((n / prev) * 100)}%` : "—";
            return (
              <li key={e} className="flex items-baseline justify-between gap-3 text-zinc-300">
                <span className="font-mono text-xs">
                  {i + 1}. {e}
                </span>
                <span className="tabular-nums">
                  {n}
                  {pct !== null && <span className="ml-2 text-xs text-zinc-500">{pct} so với bước trước</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Sự kiện gần đây (50)</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Chưa ghi nhận gì.</p>
        ) : (
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-1 font-semibold">Thời gian</th>
                  <th className="py-1 font-semibold">Sự kiện</th>
                  <th className="py-1 font-semibold">Người chơi</th>
                  <th className="py-1 font-semibold">Dữ liệu</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800 text-zinc-400">
                    <td className="whitespace-nowrap py-1 pr-2 tabular-nums">
                      {new Date(r.created_at).toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="py-1 pr-2 font-mono">{r.event}</td>
                    <td className="py-1 pr-2 font-mono">{r.player_id ? `${r.player_id.slice(0, 8)}…` : "—"}</td>
                    <td className="max-w-56 truncate py-1 font-mono">
                      {r.meta ? JSON.stringify(r.meta).slice(0, 80) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Mã VIP</h2>
        {vipMissing ? (
          <p className="mt-2 text-sm text-amber-200">
            Chưa có dữ liệu VIP — chạy migration supabase/migrations/0012_vip.sql trong Supabase.
          </p>
        ) : codes.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Chưa có mã nào — tạo ở dưới.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-semibold">Mã</th>
                <th className="py-1 text-right font-semibold">Đã dùng</th>
                <th className="py-1 text-right font-semibold">Hết hạn</th>
                <th className="py-1 font-semibold">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.code} className="border-t border-zinc-800 text-zinc-300">
                  <td className="py-1.5 font-mono text-xs">{c.code}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {c.used}/{c.max_uses}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="max-w-40 truncate py-1.5 text-xs text-zinc-400">{c.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!vipMissing && <CodesForm />}
      </section>
    </>
  );
}

export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  if (!process.env.ADMIN_SECRET) {
    return (
      <Shell title="Bảng điều khiển phễu">
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
          Chưa cấu hình quản trị — cần đặt ADMIN_SECRET trên máy chủ trước.
        </p>
      </Shell>
    );
  }
  return (
    <Shell title="Bảng điều khiển phễu">
      <Suspense fallback={<p className="text-sm text-zinc-500">Đang tải bảng điều khiển…</p>}>
        <AdminBody searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

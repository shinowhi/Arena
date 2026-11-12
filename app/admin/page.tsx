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
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Admin</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">{title}</h1>
      <a href="/admin/billing" className="mt-2 inline-block text-sm text-amber-400 underline">Billing desk</a>
      <a href="/admin/centers" className="mt-2 ml-4 inline-block text-sm text-amber-400 underline">Centers</a>
      <div className="mt-6">{children}</div>
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
          Admin key
          <input
            type="password"
            name="key"
            autoComplete="off"
            className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        {err && <p className="mt-2 text-sm text-red-400">Wrong key — try again.</p>}
        <button
          type="submit"
          className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
        >
          Unlock
        </button>
      </form>
    );
  }

  const { c7, c30, recent, missing, codes, vipMissing } = await loadDashboard();

  return (
    <>
      {missing && (
        <p className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          No funnel data yet — run migration supabase/migrations/0011_funnel.sql in Supabase, then
          events will appear here.
        </p>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Events (7d / 30d)</p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 font-semibold">Event</th>
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
        <p className="text-sm font-semibold text-zinc-200">Funnel conversion (30d)</p>
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
                  {pct !== null && <span className="ml-2 text-xs text-zinc-500">{pct} of previous</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Recent events (50)</p>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nothing logged yet.</p>
        ) : (
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-1 font-semibold">Time</th>
                  <th className="py-1 font-semibold">Event</th>
                  <th className="py-1 font-semibold">Player</th>
                  <th className="py-1 font-semibold">Meta</th>
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
        <p className="text-sm font-semibold text-zinc-200">VIP codes</p>
        {vipMissing ? (
          <p className="mt-2 text-sm text-amber-200">
            No VIP data yet — run migration supabase/migrations/0012_vip.sql in Supabase.
          </p>
        ) : codes.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No codes yet — create one below.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-semibold">Code</th>
                <th className="py-1 text-right font-semibold">Used</th>
                <th className="py-1 text-right font-semibold">Expires</th>
                <th className="py-1 font-semibold">Note</th>
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
      <Shell title="Funnel dashboard">
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
          Admin is not configured — set ADMIN_SECRET on the server first.
        </p>
      </Shell>
    );
  }
  return (
    <Shell title="Funnel dashboard">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading dashboard…</p>}>
        <AdminBody searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

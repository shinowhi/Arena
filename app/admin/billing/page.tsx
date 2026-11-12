import { Suspense } from "react";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAdmin } from "@/lib/game/player-sign";
import OrdersTable, { type PendingOrder } from "./orders-table";

// Admin billing desk (server component: every query runs server-side).
// Same arena_admin cookie gate as /admin. Pending orders render with
// approve/reject buttons (client island); metrics cards summarize conversion,
// retention, and revenue (same method as /api/admin/metrics).
type Metrics = {
  payers: number;
  totalPlayers: number;
  pct: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  revenueVnd: number;
};

const DAY_MS = 86400_000;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Admin</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">Billing desk</h1>
      <a href="/admin" className="mt-2 inline-block text-sm text-amber-400 underline">
        Back to dashboard
      </a>
      <div className="mt-6">{children}</div>
    </main>
  );
}

async function loadBilling(): Promise<{
  orders: PendingOrder[];
  metrics: Metrics;
  missing: boolean;
}> {
  const zero: Metrics = {
    payers: 0,
    totalPlayers: 0,
    pct: 0,
    d1: null,
    d7: null,
    d30: null,
    revenueVnd: 0,
  };
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return { orders: [], metrics: zero, missing: true };
  }
  const pending = await supabase
    .from("orders")
    .select("id, player_id, plan_code, amount_vnd, memo, created_at, payer_ref, device_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (pending.error) return { orders: [], metrics: zero, missing: true };
  const orders = (pending.data ?? []) as PendingOrder[];
  // Metrics (same method as /api/admin/metrics — see that route's header).
  let payers = 0;
  let revenueVnd = 0;
  const approved = await supabase
    .from("orders")
    .select("player_id, amount_vnd")
    .eq("status", "approved")
    .limit(20000);
  if (!approved.error && Array.isArray(approved.data)) {
    const seen = new Set<string>();
    for (const row of approved.data as { player_id: string; amount_vnd: unknown }[]) {
      seen.add(row.player_id);
      if (typeof row.amount_vnd === "number") revenueVnd += row.amount_vnd;
    }
    payers = seen.size;
  }
  let totalPlayers = 0;
  const retention = { d1: null as number | null, d7: null as number | null, d30: null as number | null };
  const c = await supabase.from("players").select("id", { count: "exact", head: true });
  if (!c.error) totalPlayers = c.count ?? 0;
  const p = await supabase
    .from("players")
    .select("id, created_at")
    .order("created_at", { ascending: true })
    .limit(5000);
  const e = await supabase
    .from("funnel_events")
    .select("player_id, created_at")
    .order("created_at", { ascending: false })
    .limit(20000);
  if (!p.error && !e.error && Array.isArray(p.data) && Array.isArray(e.data)) {
    const players = p.data as { id: string; created_at: string }[];
    const latest = new Map<string, number>();
    for (const row of e.data as { player_id: string | null; created_at: string }[]) {
      if (!row.player_id) continue;
      if (!latest.has(row.player_id)) latest.set(row.player_id, Date.parse(row.created_at));
    }
    const now = Date.now();
    for (const [key, days] of [["d1", 1], ["d7", 7], ["d30", 30]] as const) {
      const cohort = players.filter(
        (pl) => Number.isFinite(Date.parse(pl.created_at)) && now - Date.parse(pl.created_at) >= days * DAY_MS,
      );
      if (cohort.length === 0) continue;
      const kept = cohort.filter((pl) => {
        const last = latest.get(pl.id);
        return last !== undefined && last >= Date.parse(pl.created_at) + days * DAY_MS;
      }).length;
      retention[key] = Math.round((kept / cohort.length) * 1000) / 1000;
    }
  }
  return {
    orders,
    metrics: {
      payers,
      totalPlayers,
      pct: totalPlayers > 0 ? Math.round((payers / totalPlayers) * 1000) / 1000 : 0,
      ...retention,
      revenueVnd,
    },
    missing: false,
  };
}

async function BillingBody() {
  const store = await cookies();
  if (!verifyAdmin(store.get("arena_admin")?.value)) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        Locked — <a href="/admin" className="text-amber-400 underline">unlock with the admin key</a> first.
      </p>
    );
  }
  const { orders, metrics, missing } = await loadBilling();
  if (missing) {
    return (
      <p className="rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
        No billing data yet — run migration supabase/migrations/0016_billing.sql in Supabase and set
        SUPABASE_SERVICE_ROLE_KEY on the server.
      </p>
    );
  }
  const cards: [string, string][] = [
    ["Payers", String(metrics.payers)],
    ["Players", String(metrics.totalPlayers)],
    ["Conversion", `${(metrics.pct * 100).toFixed(1)}%`],
    ["Revenue (VND)", metrics.revenueVnd.toLocaleString("en-US")],
    ["Retention d1", metrics.d1 === null ? "—" : `${(metrics.d1 * 100).toFixed(1)}%`],
    ["Retention d7", metrics.d7 === null ? "—" : `${(metrics.d7 * 100).toFixed(1)}%`],
    ["Retention d30", metrics.d30 === null ? "—" : `${(metrics.d30 * 100).toFixed(1)}%`],
  ];
  return (
    <>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Metrics</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-lg font-bold tabular-nums text-zinc-100">{value}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Pending orders</p>
        <OrdersTable orders={orders} />
      </section>
    </>
  );
}

export default function BillingPage() {
  if (!process.env.ADMIN_SECRET) {
    return (
      <Shell>
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
          Admin is not configured — set ADMIN_SECRET on the server first.
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading billing…</p>}>
        <BillingBody />
      </Suspense>
    </Shell>
  );
}

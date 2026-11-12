import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Admin billing metrics (all server-side, service-role reads). The admin
// cookie is verified FIRST, before the service client is touched (same
// pattern as /api/admin/codes).
//
// METHOD (best-effort, documented):
//   conversion: payers = distinct player_ids with >= 1 approved order;
//     total_players = players count; pct = payers / total_players.
//   retention dN: players created >= N days ago (cohort) who logged >= 1
//     funnel_event at least N days after their own created_at. Computed in JS
//     over capped reads (5000 players / 20000 events); null when the cohort
//     is empty or the tables are missing.
//   revenue_vnd: sum(amount_vnd) over approved orders.
// GET -> {conversion, retention, revenue_vnd, method}.
const DAY_MS = 86400_000;

function serviceClientOr503() {
  try {
    return { supabase: createServiceClient(), res: null };
  } catch {
    return {
      supabase: null,
      res: NextResponse.json(
        { error: "Billing admin is not configured yet — set SUPABASE_SERVICE_ROLE_KEY on the server." },
        { status: 503 },
      ),
    };
  }
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rl = checkRate(`admin-metrics:${getClientIp(req)}`, 30, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const { supabase, res } = serviceClientOr503();
  if (!supabase) return res;

  // Conversion + revenue from approved orders.
  let payers = 0;
  let revenueVnd = 0;
  let billingMissing = false;
  try {
    const r = await supabase
      .from("orders")
      .select("player_id, amount_vnd")
      .eq("status", "approved")
      .limit(20000);
    if (r.error || !Array.isArray(r.data)) {
      billingMissing = true;
    } else {
      const seen = new Set<string>();
      for (const row of r.data as { player_id: string; amount_vnd: unknown }[]) {
        seen.add(row.player_id);
        if (typeof row.amount_vnd === "number") revenueVnd += row.amount_vnd;
      }
      payers = seen.size;
    }
  } catch {
    billingMissing = true;
  }

  // Total players + retention cohorts.
  let totalPlayers = 0;
  const retention: { d1: number | null; d7: number | null; d30: number | null } = {
    d1: null,
    d7: null,
    d30: null,
  };
  try {
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
      // Latest event per player is enough: retained(N) needs ANY event >=
      // created_at + N days, and the latest event dominates all earlier ones.
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
        if (cohort.length === 0) {
          retention[key] = null;
          continue;
        }
        const kept = cohort.filter((pl) => {
          const last = latest.get(pl.id);
          return last !== undefined && last >= Date.parse(pl.created_at) + days * DAY_MS;
        }).length;
        retention[key] = Math.round((kept / cohort.length) * 1000) / 1000;
      }
    }
  } catch {
    // Best-effort: leave zeros/nulls.
  }

  if (billingMissing) {
    return NextResponse.json(
      { error: "Billing is not set up yet — run migration 0016." },
      { status: 503 },
    );
  }
  return NextResponse.json({
    conversion: {
      payers,
      total_players: totalPlayers,
      pct: totalPlayers > 0 ? Math.round((payers / totalPlayers) * 1000) / 1000 : 0,
    },
    retention,
    revenue_vnd: revenueVnd,
    method:
      "payers = distinct players with an approved order; retention dN = share of " +
      "players created >=N days ago with any funnel event >=N days after signup " +
      "(capped reads: 5000 players / 20000 events); revenue = sum of approved orders.",
  });
}

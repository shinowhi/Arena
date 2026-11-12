import type { SupabaseClient } from "@supabase/supabase-js";
import { getVipUntil, isVip } from "@/lib/vip";

// P4 billing entitlements (slice-1 infra). Pure rules (productCovered,
// subActive) are mirror-tested offline in scripts/test-billing.mjs; the DB
// reader (getEntitlement) never throws — a missing table or failed query
// degrades to "no subscription coverage" (fail-closed on paid access, same as
// lib/vip's fail-closed VIP check). No paywall wiring yet (slice-2).

export type WantProduct = "A" | "B";

// Pure: a bundle plan covers both products; a single-product plan covers only
// itself. Unknown plan products cover nothing (fail-closed).
export function productCovered(planProduct: string, want: WantProduct): boolean {
  if (planProduct === "bundle") return true;
  return planProduct === want;
}

// Pure: a subscription row counts while status is active and ends_at is in the
// future (expiry boundary: ends_at == now is EXPIRED, same strictness as
// lib/vip's isVip).
export function subActive(status: string, endsAt: string, nowMs: number): boolean {
  if (status !== "active") return false;
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > nowMs;
}

export type Entitlement = {
  vip: boolean;
  products: { A: boolean; B: boolean };
  // Furthest known entitlement timestamp (VIP or subscription), or null.
  until: string | null;
};

type SubRow = { plan_code: string; ends_at: string; status: string; plans?: unknown };

function planProductOf(row: SubRow): string | null {
  // Supabase embeds the joined plans row as an object (or array with some
  // client versions); unknown shapes resolve to null (fail-closed).
  const joined = row.plans;
  const obj = Array.isArray(joined) ? joined[0] : joined;
  if (obj && typeof obj === "object" && typeof (obj as { product?: unknown }).product === "string") {
    return (obj as { product: string }).product;
  }
  return null;
}

// Active = VIP(vip_until) OR any active+unexpired subscription; a bundle
// subscription (or VIP) covers both A and B.
export async function getEntitlement(
  supabase: SupabaseClient,
  playerId: string,
): Promise<Entitlement> {
  const empty: Entitlement = { vip: false, products: { A: false, B: false }, until: null };
  try {
    const [vip, vipUntil] = await Promise.all([
      isVip(supabase, playerId).catch(() => false),
      getVipUntil(supabase, playerId).catch(() => null),
    ]);
    let subs: SubRow[] = [];
    try {
      const r = await supabase
        .from("subscriptions")
        .select("plan_code, ends_at, status, plans(product)")
        .eq("player_id", playerId)
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString());
      if (!r.error && Array.isArray(r.data)) subs = r.data as SubRow[];
    } catch {
      subs = [];
    }
    const nowMs = Date.now();
    let coverA = vip;
    let coverB = vip;
    let until: string | null =
      vip && vipUntil && Date.parse(vipUntil) > nowMs ? vipUntil : null;
    for (const s of subs) {
      if (!subActive(s.status, s.ends_at, nowMs)) continue;
      const product = planProductOf(s);
      if (!product) continue;
      if (productCovered(product, "A")) coverA = true;
      if (productCovered(product, "B")) coverB = true;
      if (!until || Date.parse(s.ends_at) > Date.parse(until)) until = s.ends_at;
    }
    return { vip, products: { A: coverA, B: coverB }, until };
  } catch {
    return empty;
  }
}

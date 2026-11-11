import type { SupabaseClient } from "@supabase/supabase-js";

// P2 VIP monetization helpers. Pure rules (quotaAllowed, extendVip,
// normalizeCode) are mirror-tested offline in scripts/test-vip.mjs; DB
// readers (isVip, getVipUntil, countToday) never throw — a missing table or
// failed query degrades to "not VIP" / 0 so gates fail closed on VIP status
// but open on quota counts (fail-closed on BOTH would lock out free users
// when the DB hiccups; the rate limiter still blunts abuse).
export const VIP_DAYS = 30;
export const FREE_SCAN_DAILY = 5;
export const FREE_TUTOR_DAILY = 10;

// Pure: VIPs bypass every quota; free users pass while under the limit.
export function quotaAllowed(usedToday: number, limit: number, vip: boolean): boolean {
  if (vip) return true;
  return usedToday < limit;
}

// Pure: new vip_until = max(now, current) + VIP_DAYS. currentIso null or
// unparseable means "no active VIP" -> now + VIP_DAYS. Mirrors the SQL in
// claim_vip_code (greatest(now, max(vip_until)) + 30 days).
export function extendVip(currentIso: string | null, now: Date): string {
  const nowMs = now.getTime();
  const curMs = currentIso ? Date.parse(currentIso) : NaN;
  const base = Number.isFinite(curMs) && curMs > nowMs ? curMs : nowMs;
  return new Date(base + VIP_DAYS * 86400_000).toISOString();
}

// Pure: code validation rules (trim, uppercase, 1..32 chars). Returns the
// canonical code or null. Used by the claim route; mirrored in test-vip.mjs.
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (code.length === 0 || code.length > 32) return null;
  return code;
}

type VipRow = { vip_until: string };

// Latest vip_until for a player, or null (none / table missing / DB error).
export async function getVipUntil(
  supabase: SupabaseClient,
  playerId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("vip_claims")
      .select("vip_until")
      .eq("player_id", playerId)
      .order("vip_until", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return (data[0] as VipRow).vip_until ?? null;
  } catch {
    return null;
  }
}

export async function isVip(supabase: SupabaseClient, playerId: string): Promise<boolean> {
  const until = await getVipUntil(supabase, playerId);
  return !!until && Date.parse(until) > Date.now();
}

// Funnel-event count for a player since UTC midnight. Missing table or any
// error degrades to 0 (fail-open: the rate limiter is the abuse backstop).
export async function countToday(
  supabase: SupabaseClient,
  playerId: string,
  event: string,
): Promise<number> {
  try {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const r = await supabase
      .from("funnel_events")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId)
      .eq("event", event)
      .gte("created_at", midnight.toISOString());
    if (r.error) return 0;
    return r.count ?? 0;
  } catch {
    return 0;
  }
}

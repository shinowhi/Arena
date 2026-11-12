import type { SupabaseClient } from "@supabase/supabase-js";

// P4 Xu soft-currency helpers (slice-1 infra). Balance = sum(delta) over
// xu_ledger rows for the player. Daily claims go through the claim_daily_xu
// RPC (migration 0016: fixed +100 server-side, once per UTC day via the
// xu_daily_uidx partial unique index); this module only READS.

// Coordinator-flagged assumption — confirm amount with user/A.
export const XU_DAILY = 100;

// Sum of all ledger deltas for a player. Missing table or any error degrades
// to 0 (fail-closed on currency: never show phantom Xu).
export async function getBalance(
  supabase: SupabaseClient,
  playerId: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("xu_ledger")
      .select("delta")
      .eq("player_id", playerId);
    if (error || !Array.isArray(data)) return 0;
    let sum = 0;
    for (const row of data as { delta: unknown }[]) {
      if (typeof row.delta === "number" && Number.isFinite(row.delta)) sum += row.delta;
    }
    return sum;
  } catch {
    return 0;
  }
}

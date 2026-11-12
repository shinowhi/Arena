// P4 slice-2 paywall: free-usage counting. Product A (boss/scan) counts
// DISTINCT fixed gaps: a "fixed gap" is one skill_tag where the player
// damaged a now-DEAD boss (correct attack + bosses.status DEAD + skill_tag),
// mirroring the countdown-route join pattern. Product B (exam mocks) counts
// SERVED mocks (exam_started funnel events): an exam-only player never kills
// a boss, so gaps alone would leave B free forever. Pure boundaries
// (gapsExhausted/servesExhausted) and the distinct-count rule are
// mirror-tested offline in scripts/test-paywall.mjs. DB readers never throw —
// a missing table or failed query degrades to 0 (fail-open: free users keep
// access when the DB hiccups, same rationale as lib/vip's countToday; the
// trade-off is a revenue-off switch during an attacks/funnel outage).

import type { SupabaseClient } from "@supabase/supabase-js";

// Coordinator flags (lock 15): free fixes / free mocks before the paywall.
export const FREE_GAPS = 3;
export const FREE_EXAMS = 3;

type AttackRow = { bosses: { skill_tag: string; status: string } | null };

// DISTINCT skill_tags with a DEAD boss the player correctly damaged.
export async function countFixedGaps(
  supabase: SupabaseClient,
  playerId: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("attacks")
      .select("bosses(skill_tag, status)")
      .eq("player_id", playerId)
      .eq("correct", true)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error || !Array.isArray(data)) return 0;
    const fixed = new Set<string>();
    // Supabase infers the join as to-many (array); normalize like drill/create.
    for (const a of data as unknown as Array<{ bosses: AttackRow["bosses"] | AttackRow["bosses"][] }>) {
      const b = Array.isArray(a.bosses) ? a.bosses[0] : a.bosses;
      if (b?.status === "DEAD" && b.skill_tag) fixed.add(b.skill_tag);
    }
    return fixed.size;
  } catch {
    return 0;
  }
}

// Served exam mocks for the player (funnel exam_started events, all time).
export async function countExamServes(
  supabase: SupabaseClient,
  playerId: string,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("funnel_events")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId)
      .eq("event", "exam_started");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Pure: the free tier is spent once FREE_GAPS distinct gaps are fixed.
export function gapsExhausted(fixedCount: number): boolean {
  return fixedCount >= FREE_GAPS;
}

// Pure: product-B free tier is spent once FREE_EXAMS mocks are served.
export function servesExhausted(servedCount: number): boolean {
  return servedCount >= FREE_EXAMS;
}

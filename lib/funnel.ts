import type { SupabaseClient } from "@supabase/supabase-js";

// P1 education-funnel analytics. Event names are exact strings shared with
// the admin dashboard (app/admin/page.tsx); rename in both places at once.
export type FunnelEvent =
  | "scan_started"
  | "scan_completed"
  | "boss_summoned"
  | "boss_killed"
  | "exam_started"
  | "exam_graded"
  | "duel_created"
  | "duel_finished"
  | "royale_joined"
  | "essay_graded"
  | "tutor_asked"
  | "order_created"
  | "order_approved";

// Best-effort insert into funnel_events (migration 0011). Never throws and
// never fails the caller: missing table, RLS hiccup, and network blips all
// collapse to a silent no-op. Never pass answers or keys in meta.
export async function logFunnel(
  supabase: SupabaseClient,
  playerId: string | null,
  event: FunnelEvent,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("funnel_events").insert({
      player_id: playerId,
      event,
      ...(meta ? { meta } : {}),
    });
  } catch {
    // Best-effort: the funnel must never break the user path.
  }
}

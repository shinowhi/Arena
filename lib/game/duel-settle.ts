import type { SupabaseClient } from "@supabase/supabase-js";
import { decideWinner, DuelRow, DuelWinner, eloScore, eloUpdate } from "./duel";

// Idempotent duel settlement, shared by submit + view (the view retries a
// wedged duel on every poll). Preferred path is the settle_duel_elo RPC,
// which locks the duel row and both ELO rows in one transaction (no
// cross-duel read-modify-write race). Pre-migration (RPC missing) it falls
// back to the legacy TS path below, which keeps the same elo_done gate.
export async function settleDuel(
  supabase: SupabaseClient,
  id: string,
): Promise<{ finished: boolean; winner: DuelWinner | null }> {
  try {
    const rpc = await supabase.rpc("settle_duel_elo", { p_duel: id });
    if (!rpc.error) {
      const w = rpc.data as string | null;
      if (w === null) return { finished: false, winner: null };
      const winner: DuelWinner | null = w === "p1" || w === "p2" || w === "draw" ? w : null;
      return { finished: true, winner };
    }
    // RPC error: pre-0010 the function is missing, otherwise the call was
    // rejected — either way the legacy path below re-reads and preserves
    // the pre-RPC contract (returns or throws). Log the unexpected case.
    if (!isMissingRpc(rpc.error as { code?: string; message?: string })) {
      console.error("settle_duel_elo rejected, using legacy settle:", (rpc.error as { message?: string }).message ?? rpc.error);
    }
  } catch {
    // Transport-level throw: let the legacy path decide (read or throw).
  }
  return settleDuelLegacy(supabase, id);
}

function isMissingRpc(err: { code?: string; message?: string }): boolean {
  if (err.code === "PGRST202" || err.code === "42P01" || err.code === "42883") return true;
  return /could not find/i.test(err.message ?? "");
}

// Legacy TS settlement (pre-0010 fallback). Both-scored → winner + ELO
// exactly once via the elo_done race gate. ELO failure resets the gate and
// throws so a later call retries; cross-duel races are accepted here.
async function settleDuelLegacy(
  supabase: SupabaseClient,
  id: string,
): Promise<{ finished: boolean; winner: DuelWinner | null }> {
  const got = await supabase.from("exam_duels").select("*").eq("id", id).single();
  const parsed = DuelRow.safeParse(got.data);
  if (!parsed.success) throw new Error("settle read failed");
  const d = parsed.data;
  if (d.status === "finished") return { finished: true, winner: d.winner };
  if (d.p1_score === null || d.p2_score === null || !d.p2_player_id) {
    return { finished: false, winner: null };
  }
  const winner =
    decideWinner(
      { score: d.p1_score, doneAt: d.p1_done_at ?? "" },
      { score: d.p2_score, doneAt: d.p2_done_at ?? "" },
    ) ?? "draw";
  const fin = await supabase
    .from("exam_duels")
    .update({ status: "finished", winner, elo_done: true })
    .eq("id", id)
    .eq("elo_done", false)
    .select("id");
  if (fin.error) throw new Error("settle write failed");
  if (!fin.data || fin.data.length === 0) {
    // Lost the race: someone else settled. Re-read the terminal state.
    const re = await supabase.from("exam_duels").select("winner").eq("id", id).single();
    const w = (re.data as { winner: DuelWinner | null } | null)?.winner ?? winner;
    return { finished: true, winner: w };
  }
  const elos = await supabase.from("exam_elo").select("player_id, rating, games").eq("exam", d.exam).in("player_id", [d.p1_player_id, d.p2_player_id]);
  const em = new Map((elos.data as Array<{ player_id: string; rating: number; games: number }> ?? []).map((r) => [r.player_id, r]));
  const r1 = em.get(d.p1_player_id) ?? { rating: 1200, games: 0 };
  const r2 = em.get(d.p2_player_id) ?? { rating: 1200, games: 0 };
  const { na, nb } = eloUpdate(r1.rating, r2.rating, eloScore(winner, "p1"));
  const up = await supabase.from("exam_elo").upsert(
    [
      { player_id: d.p1_player_id, exam: d.exam, rating: na, games: r1.games + 1 },
      { player_id: d.p2_player_id, exam: d.exam, rating: nb, games: r2.games + 1 },
    ],
    { onConflict: "player_id,exam" },
  );
  if (up.error) {
    await supabase.from("exam_duels").update({ status: "live", winner: null, elo_done: false }).eq("id", id);
    throw new Error("settle ELO failed");
  }
  return { finished: true, winner };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { decideWinner, DuelRow, DuelWinner, eloScore, eloUpdate } from "./duel";

// Idempotent duel settlement, shared by submit + view (the view retries a
// wedged duel on every poll). Both-scored → winner + ELO exactly once via the
// elo_done race gate. ELO failure resets the gate and throws so a later call
// retries; cross-duel read-modify-write races are accepted for the demo.
export async function settleDuel(
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

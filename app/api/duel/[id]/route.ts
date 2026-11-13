import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { DuelRow, sideOf } from "@/lib/game/duel";
import { settleDuel } from "@/lib/game/duel-settle";
import { logFunnel } from "@/lib/funnel";
import { examConfig } from "@/lib/agents/exam";

// Duel view: stripped paper + live progress. Scores stay hidden until both
// sides finish (no peeking). Keys never leave the server.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad duel id." }, { status: 400 });
  try {
    // SECURITY PHASE-1: spectators never mint a player. Null players see
    // the public view with you: null (logFunnel already accepts null).
    const playerId = await getPlayerId();
    const supabase = await createClient();
    const got = await supabase.from("exam_duels").select("*").eq("id", id).maybeSingle();
    if (got.error) {
      if ((got.error as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Duel tables missing.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: "Duel lookup failed — retry." }, { status: 500 });
    }
    if (!got.data) return NextResponse.json({ error: "Duel not found." }, { status: 404 });
    const duel = DuelRow.safeParse(got.data);
    if (!duel.success) return NextResponse.json({ error: "Duel lookup failed — retry." }, { status: 500 });
    let d = duel.data;
    // Wedged-duel retry: both scored but never settled → settle now.
    if (d.p1_score !== null && d.p2_score !== null && d.status !== "finished") {
      try {
        const s = await settleDuel(supabase, id);
        if (s.finished) await logFunnel(supabase, playerId, "duel_finished", { winner: s.winner });
        if (s.finished) {
          const re = await supabase.from("exam_duels").select("*").eq("id", id).single();
          const rp = DuelRow.safeParse(re.data);
          if (rp.success) d = rp.data;
        }
      } catch {
        // Settle failed: serve the live view; the next poll retries.
      }
    }
    const cfg = examConfig(d.exam);
    const secName = cfg?.sections.find((s) => s.id === d.section_id)?.name ?? d.section_id;
    const eloRows = await supabase
      .from("exam_elo")
      .select("player_id, rating, games")
      .eq("exam", d.exam)
      .in("player_id", [d.p1_player_id, ...(d.p2_player_id ? [d.p2_player_id] : [])]);
    const elo = new Map((eloRows.data as Array<{ player_id: string; rating: number; games: number }> ?? []).map((r) => [r.player_id, r]));
    const eloOf = (pid: string | null) =>
      pid ? { rating: elo.get(pid)?.rating ?? 1200, games: elo.get(pid)?.games ?? 0 } : null;
    const finished = d.status === "finished";
    return NextResponse.json({
      id: d.id,
      exam: d.exam,
      section: { id: d.section_id, name: secName },
      status: d.status,
      winner: d.winner,
      you: playerId ? sideOf(d, playerId) : null,
      p1: { done: d.p1_score !== null, score: finished ? d.p1_score : null, elo: eloOf(d.p1_player_id) },
      p2: d.p2_player_id
        ? { done: d.p2_score !== null, score: finished ? d.p2_score : null, elo: eloOf(d.p2_player_id) }
        : null,
      paper: d.paper.map((q, i) => ({ no: i + 1, prompt_latex: q.prompt_latex, options: q.options, tier: q.tier })),
    });
  } catch {
    return NextResponse.json({ error: "Duel lookup failed — retry." }, { status: 500 });
  }
}

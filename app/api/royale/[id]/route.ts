import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { advanceRoom } from "@/lib/game/royale-advance";
import { examConfig } from "@/lib/agents/exam";

// Room view (+ lazy round advance): stripped current question, roster with
// alive/score only, round clock. Keys never leave the server.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad room id." }, { status: 400 });
  try {
    // SECURITY PHASE-1: spectators never mint a player. Every comparison
    // below is null-safe: me → null, youWon/isCreator → false, roster
    // you-flags → false (youWon is guarded by !!winner).
    const playerId = await getPlayerId();
    const supabase = await createClient();
    let st;
    try {
      st = await advanceRoom(supabase, id, Date.now());
    } catch (e) {
      if ((e as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Royale tables missing.", needsMigration: true }, { status: 503 });
      }
      throw e;
    }
    if (!st) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    const cfg = examConfig(st.room.exam);
    const secName = cfg?.sections.find((s) => s.id === st.room.section_id)?.name ?? st.room.section_id;
    const me = st.players.find((p) => p.player_id === playerId) ?? null;
    const q = st.room.paper[st.room.round] ?? null;
    return NextResponse.json({
      id: st.room.id,
      exam: st.room.exam,
      section: { id: st.room.section_id, name: secName },
      status: st.room.status,
      round: st.room.round,
      totalRounds: st.room.paper.length,
      round_ends_at: st.room.round_ends_at,
      winner: st.room.winner,
      winner_short: st.room.winner ? st.room.winner.slice(0, 6) : null,
      youWon: !!st.room.winner && st.room.winner === playerId,
      isCreator: st.room.creator_player_id === playerId,
      you: me ? { alive: me.alive, score: me.score, answered: me.answered } : null,
      roster: st.players.map((p) => ({ short: p.player_id.slice(0, 6), alive: p.alive, score: p.score, you: p.player_id === playerId })),
      question:
        st.room.status === "live" && q
          ? { no: st.room.round + 1, prompt_latex: q.prompt_latex, options: q.options, tier: q.tier }
          : null,
    });
  } catch {
    return NextResponse.json({ error: "Room lookup failed — retry." }, { status: 500 });
  }
}

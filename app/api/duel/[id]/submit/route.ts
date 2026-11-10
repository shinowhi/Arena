import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { canSubmit, DuelRow, sideOf } from "@/lib/game/duel";
import { settleDuel } from "@/lib/game/duel-settle";

const Body = z.object({ answers: z.array(z.number().int().min(-1).max(3)).min(1).max(60) });

// Submits one side's answers. Grades server-side against the PINNED paper:
// a mid-duel refresh voids the duel as a draw (409) instead of misgrading.
// ELO applies exactly once via the elo_done race gate.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad duel id." }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing answers." }, { status: 400 });
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const got = await supabase.from("exam_duels").select("*").eq("id", id).maybeSingle();
    if (got.error) {
      if ((got.error as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Duel tables missing.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: "Submit failed — retry." }, { status: 500 });
    }
    if (!got.data) return NextResponse.json({ error: "Duel not found." }, { status: 404 });
    const duel = DuelRow.safeParse(got.data);
    if (!duel.success) return NextResponse.json({ error: "Submit failed — retry." }, { status: 500 });
    const d = duel.data;
    const side = sideOf(d, playerId);
    if (!side) return NextResponse.json({ error: "Not your duel." }, { status: 403 });
    if (!canSubmit(d, playerId)) return NextResponse.json({ error: "Already submitted or duel finished." }, { status: 409 });
    // Grade against the duel's own snapshot: immune to cache refresh.
    if (parsed.data.answers.length !== d.paper.length) {
      return NextResponse.json({ error: "Answer count mismatch — reload." }, { status: 400 });
    }
    const score = parsed.data.answers.filter((a, i) => a === d.paper[i].answer_index).length;
    const doneAt = new Date().toISOString();
    const mine = side === "p1" ? { p1_score: score, p1_done_at: doneAt } : { p2_score: score, p2_done_at: doneAt };
    // Race-safe: only the first submit per side lands.
    const scoreCol = side === "p1" ? "p1_score" : "p2_score";
    const upd = await supabase.from("exam_duels").update(mine).eq("id", id).is(scoreCol, null).select("id");
    if (upd.error) return NextResponse.json({ error: "Submit failed — retry." }, { status: 500 });
    if (!upd.data || upd.data.length === 0) {
      return NextResponse.json({ error: "Already submitted." }, { status: 409 });
    }
    // Shared idempotent settle (also retried by the view on every poll).
    try {
      const s = await settleDuel(supabase, id);
      return NextResponse.json({ score, total: d.paper.length, finished: s.finished, winner: s.winner });
    } catch {
      return NextResponse.json({ error: "Submit recorded — settle failed, reload." }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Submit failed — retry." }, { status: 500 });
  }
}

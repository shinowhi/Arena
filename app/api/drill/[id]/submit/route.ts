import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { DrillPaper } from "@/lib/drill/paper";
import { suggestNext, type PerSkill } from "@/lib/drill/suggest";
import { checkRate, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { verifyAnswer } from "@/lib/verify/math-verifier";

// Blanks arrive as null (JSON has no NaN): they grade wrong, never as zero.
const Body = z.object({
  answers: z.array(z.union([z.number().finite(), z.null()])).max(25),
});

type DrillRow = { player_id: string; source: "weak" | "misses" | "topic" | "upload"; paper: unknown };

// Server-side grading against the stored keyed paper. One paper_attempts row
// per question. Read-only identity: unknown players get 403 WITHOUT minting.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing answers array." }, { status: 400 });
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) return NextResponse.json({ error: "Not your drill set." }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drill_sets")
    .select("player_id, source, paper")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Drill set not found." }, { status: 404 });
  const row = data as DrillRow;
  if (row.player_id !== playerId) {
    return NextResponse.json({ error: "Not your drill set." }, { status: 403 });
  }
  // 20/min per owner: marks leak per-question correctness, so unbounded
  // resubmits would allow hill-climbing numeric answers.
  const rl = checkRate(`drill-submit:${playerId}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const paper = DrillPaper.safeParse(row.paper);
  if (!paper.success) {
    return NextResponse.json({ error: "Drill set is corrupted — start a new one." }, { status: 500 });
  }
  const questions = paper.data.questions;
  if (parsed.data.answers.length !== questions.length) {
    return NextResponse.json({ error: "Answer count does not match this set." }, { status: 400 });
  }
  let score = 0;
  const marks: boolean[] = [];
  const per_skill: PerSkill = {};
  questions.forEach((q, i) => {
    const a = parsed.data.answers[i];
    const correct = typeof a === "number" && verifyAnswer(q.check, a, q.tolerance);
    marks.push(correct);
    if (correct) score += 1;
    const s = per_skill[q.skill_tag] ?? { right: 0, total: 0 };
    s.total += 1;
    if (correct) s.right += 1;
    per_skill[q.skill_tag] = s;
  });
  const { error: insErr } = await supabase.from("paper_attempts").insert(
    questions.map((q, i) => ({
      set_id: id,
      player_id: playerId,
      skill_tag: q.skill_tag,
      correct: marks[i],
    })),
  );
  if (insErr) {
    return NextResponse.json({ error: "Could not save your drill score — retry." }, { status: 500 });
  }
  const total = questions.length;
  const scorePct = total === 0 ? 0 : Math.round((score / total) * 100);
  const suggestions = suggestNext({ scorePct, perSkill: per_skill, source: row.source, setId: id });
  // Marks reveal only right/wrong for YOUR answers — never the keys.
  return NextResponse.json({ score, total, score_pct: scorePct, marks, per_skill, suggestions });
}

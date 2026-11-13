import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { verifyAnswer } from "@/lib/verify/math-verifier";
import { CheckSpecSchema } from "@/lib/agents/boss-generator";
import { explainMistake } from "@/lib/agents/mistake-tutor";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Why-wrong tutor: explains the likely mistake without ever revealing the
// answer (server recomputes + leak-guards the nudge). No storage.
const Body = z.object({
  boss_id: z.string().min(1),
  question_index: z.number().int().min(0),
  wrong_answer: z.number().finite(),
});

type Q = {
  level: number;
  prompt_latex: string;
  hint: string;
  answer_numeric: number;
  tolerance: number;
  check: z.infer<typeof CheckSpecSchema>;
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  // IP bucket before any mint/DB work; player bucket after auth, before the LLM.
  const ipRl = checkRate(`tutor-mistake:ip:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const supabase = await createClient();
    const [playerId, bossRes] = await Promise.all([
      getOrCreatePlayerId(),
      supabase.from("bosses").select("skill_tag, owner_player_id, questions").eq("id", parsed.data.boss_id).single(),
    ]);
    const rl = checkRate(`tutor-mistake:${playerId}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const row = bossRes.data as { skill_tag: string; owner_player_id: string | null; questions: Q[] } | null;
    if (!row) return NextResponse.json({ error: "Boss not found." }, { status: 404 });
    if (row.owner_player_id && row.owner_player_id !== playerId) {
      return NextResponse.json({ error: "Not your boss." }, { status: 403 });
    }
    const q = row.questions[parsed.data.question_index];
    if (!q) return NextResponse.json({ error: "Bad question index." }, { status: 400 });
    const actually = verifyAnswer(q.check, parsed.data.wrong_answer, q.tolerance);
    if (actually) return NextResponse.json({ error: "That answer is correct." }, { status: 400 });
    const nudge = await explainMistake({
      skill_tag: row.skill_tag,
      prompt_latex: q.prompt_latex,
      answer: q.answer_numeric,
      tolerance: q.tolerance,
      wrong: parsed.data.wrong_answer,
    });
    return NextResponse.json({ nudge });
  } catch (err) {
    console.error("mistake tutor failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Tutor failed — retry." }, { status: 422 });
  }
}

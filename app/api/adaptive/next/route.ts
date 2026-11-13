import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SKILL_IDS, skillName } from "@/lib/graph/skills";
import { BossQuestion } from "@/lib/agents/boss-generator";
import { levelForRating, lowestRated, START_RATING } from "@/lib/game/adaptive";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Next adaptive drill: weakest-rated cached skill at the matching level.
// Client holds ratings (session); server holds the question cache.
const Body = z.object({
  stats: z.record(z.string(), z.object({ rating: z.number().finite(), games: z.number().int().min(0) })).default({}),
  exclude: z.array(z.string()).max(81).default([]),
});



export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad stats." }, { status: 400 });
  // IP-only bucket (ratings live client-side; no player identity here).
  const ipRl = checkRate(`adaptive-next:ip:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("boss_question_cache")
      .select("skill_tag")
      .eq("set_version", 1)
      .limit(5000);
    if (error || !data) return NextResponse.json({ error: "Next failed — retry." }, { status: 500 });
    const cached = new Set((data as Array<{ skill_tag: string }>).map((r) => r.skill_tag));
    const pool = SKILL_IDS.filter((id) => cached.has(id) && !parsed.data.exclude.includes(id));
    if (pool.length === 0) return NextResponse.json({ error: "No cached skills — prime first." }, { status: 503 });
    const pick = lowestRated(parsed.data.stats, pool);
    if (!pick) return NextResponse.json({ error: "Next failed — retry." }, { status: 500 });
    const rating = parsed.data.stats[pick]?.rating ?? START_RATING;
    const level = levelForRating(rating);
    const row = await supabase
      .from("boss_question_cache")
      .select("questions")
      .eq("set_version", 1)
      .eq("skill_tag", pick)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const list = z.array(BossQuestion).safeParse((row?.data as { questions: unknown } | null)?.questions);
    if (!list.success || list.data.length === 0) return NextResponse.json({ error: "Next failed — retry." }, { status: 500 });
    const q = list.data.find((x) => x.level === level) ?? list.data[0];
    return NextResponse.json({
      skill_tag: pick,
      skill_name: skillName(pick),
      level: q.level,
      rating,
      question: { prompt_latex: q.prompt_latex, hint: q.hint, tolerance: q.tolerance, check: q.check },
    });
  } catch {
    return NextResponse.json({ error: "Next failed — retry." }, { status: 500 });
  }
}

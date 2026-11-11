import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { generateBossQuestions } from "@/lib/agents/boss-generator";
import { BOSS_SET_VERSION } from "@/lib/game/boss-cache";
import { SKILL_IDS } from "@/lib/graph/skills";
import { createClient } from "@/lib/supabase/server";

// Vercel cron warmer: GET /api/cron/prime?slot=N (see vercel.json). Each run
// forges ONE boss skill set and upserts it as an ownerless template — the
// only prime slice that reliably fits a 60s serverless run (5 questions,
// usually one LLM call). Exam sections (12-50Q via forgeSection) take
// minutes each, so prime-exam-cache.mjs stays MANUAL — run it from a shell
// every 2 days. Forge logic is NOT duplicated here: generateBossQuestions is
// the same function the prime script and the summon path use. Responses carry
// counts/status only — questions and keys never leave the server.
export const maxDuration = 60;

// Pure helpers (mirror-tested in scripts/test-cron.mjs).
export function isCronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || typeof authHeader !== "string" || authHeader.length === 0) return false;
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

const DAY_MS = 86400000;

// Round-robin slot: numeric ?slot=N offsets the daily rotation so the four
// daily cron entries (slots 0/20/40/60) each sweep a different skill per day.
// Garbage/missing slot behaves as 0; count <= 0 yields 0.
export function primeSlotIndex(slotParam: string | null, count: number, nowMs: number = Date.now()): number {
  if (count <= 0) return 0;
  const day = Math.floor(nowMs / DAY_MS);
  const slot = slotParam !== null && /^\d+$/.test(slotParam) ? Number(slotParam) : 0;
  return (slot + day) % count;
}

// Mirror of the freshness window in lib/game/boss-cache.ts: fresh rows are
// skipped so a cron tick costs one read when the cache is warm.
const FRESH_MS = 12 * 3600 * 1000;

export async function GET(req: Request) {
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron ticks when
  // CRON_SECRET is set. Anything else (or an unset secret) is a flat 401.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const skill = SKILL_IDS[primeSlotIndex(new URL(req.url).searchParams.get("slot"), SKILL_IDS.length)];
  if (!skill) return NextResponse.json({ error: "No skills configured." }, { status: 500 });
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    const cur = await supabase
      .from("boss_question_cache")
      .select("fetched_at")
      .eq("skill_tag", skill)
      .eq("set_version", BOSS_SET_VERSION)
      .maybeSingle();
    const at = (cur.data as { fetched_at: string } | null)?.fetched_at;
    if (at && Date.now() - new Date(at).getTime() < FRESH_MS) {
      return NextResponse.json({ ok: true, skill, action: "skipped", ms: Date.now() - t0 });
    }
    const out = await generateBossQuestions(skill);
    const up = await supabase.from("boss_question_cache").upsert(
      {
        skill_tag: skill,
        set_version: BOSS_SET_VERSION,
        questions: out.questions,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "skill_tag,set_version" },
    );
    if (up.error) throw new Error("Cache write failed.");
    return NextResponse.json({ ok: true, skill, action: "forged", ms: Date.now() - t0 });
  } catch {
    return NextResponse.json({ error: "Prime failed — retry." }, { status: 500 });
  }
}

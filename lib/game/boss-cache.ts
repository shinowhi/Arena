import { z } from "zod";
import { BossQuestion, generateBossQuestions } from "@/lib/agents/boss-generator";
import { verifyAnswer } from "@/lib/verify/math-verifier";
import { createClient } from "@/lib/supabase/server";

// Ownerless verified question-set templates, keyed by (skill_tag, set_version).
// Summon clones a cached set into a fresh OWNED boss row per viewer — cached
// rows are never served as another viewer's boss.
// Question-set version: bump when the generator prompt/shape changes so stale
// sets stop matching the key.
export const BOSS_SET_VERSION = 1;

// Fresh rows serve instantly with no refill; stale rows serve instantly while
// one background refresh refills the cache (in-code stale-while-revalidate,
// no cron needed). Practice sets stay valid indefinitely, so the window is
// about variety, not correctness.
const FRESH_MS = 12 * 3600 * 1000;
const STALE_MAX_MS = 7 * 24 * 3600 * 1000;

// Coalesce concurrent misses per skill: N waiters cause one LLM generation.
const inflight = new Map<string, Promise<BossQuestion[]>>();

const CachedShape = z.array(BossQuestion).length(5);

function validQuestions(raw: unknown): BossQuestion[] | null {
  // Stored rows hold the bare questions array (see writeRow), not BossOutput.
  const parsed = CachedShape.safeParse(raw);
  if (!parsed.success) return null;
  const qs = parsed.data;
  for (const q of qs) {
    if (!verifyAnswer(q.check, q.answer_numeric, q.tolerance)) return null;
  }
  return qs;
}

async function readRow(skill_tag: string): Promise<{ questions: BossQuestion[]; ageMs: number } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("boss_question_cache")
      .select("questions, fetched_at")
      .eq("skill_tag", skill_tag)
      .eq("set_version", BOSS_SET_VERSION)
      .single();
    if (error || !data) return null;
    const row = data as { questions: unknown; fetched_at: string };
    const questions = validQuestions(row.questions);
    if (!questions) return null;
    return { questions, ageMs: Date.now() - new Date(row.fetched_at).getTime() };
  } catch {
    // Table missing (0007 not run yet), network blip, etc: fall to LLM path.
    return null;
  }
}

async function writeRow(skill_tag: string, questions: BossQuestion[]): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("boss_question_cache").upsert(
      {
        skill_tag,
        set_version: BOSS_SET_VERSION,
        questions,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "skill_tag,set_version" },
    );
  } catch {
    // Cache is best-effort; the summon already succeeded.
  }
}

function generateAndStore(skill_tag: string): Promise<BossQuestion[]> {
  const key = `${skill_tag}:v${BOSS_SET_VERSION}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = generateBossQuestions(skill_tag)
    .then(async (out) => {
      await writeRow(skill_tag, out.questions);
      return out.questions;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export type CachedQuestions = { questions: BossQuestion[]; cached: boolean };

export async function getBossQuestionsCached(skill_tag: string): Promise<CachedQuestions> {
  const hit = await readRow(skill_tag);
  if (hit && hit.ageMs <= FRESH_MS) return { questions: hit.questions, cached: true };
  if (hit && hit.ageMs <= STALE_MAX_MS) {
    void generateAndStore(skill_tag).catch(() => {});
    return { questions: hit.questions, cached: true };
  }
  return { questions: await generateAndStore(skill_tag), cached: false };
}

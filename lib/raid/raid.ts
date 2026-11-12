import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BossQuestion } from "@/lib/agents/boss-generator";
import { BOSS_SET_VERSION } from "@/lib/game/boss-cache";
import { verifyAnswer } from "@/lib/verify/math-verifier";

// P4.3 raid bosses (light FOMO): twice-daily shared bosses spawned by the
// /api/cron/raid ticks in vercel.json. Pure helpers below are mirror-tested
// in scripts/test-raid.mjs — keep the mirrors in sync when editing.

export const RAID_DAY_MS = 86400000;
export const RAID_TTL_MS = 3 * 3600 * 1000;

export function raidDayNumber(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / RAID_DAY_MS);
}

// Numeric ?slot=N only; garbage/missing behaves as 0 (same rule as prime).
export function parseRaidSlot(slotParam: string | null): number {
  return slotParam !== null && /^\d+$/.test(slotParam) ? Number(slotParam) : 0;
}

// Deterministic daily rotation: (slot + day) over the skill list, so the two
// daily ticks each sweep a different skill and every skill recurs.
export function raidSkillFor(
  slotParam: string | null,
  dayNumber: number,
  ids: readonly string[],
): string | null {
  if (ids.length === 0) return null;
  return ids[(parseRaidSlot(slotParam) + dayNumber) % ids.length] ?? null;
}

// Idempotency key: one raid per slot per UTC day.
export function raidSpawnKey(slotParam: string | null, nowMs: number = Date.now()): string {
  return `raid:${raidDayNumber(nowMs)}:${parseRaidSlot(slotParam)}`;
}

// Raids live 3h from spawn (midday/evening surprise windows).
export function raidDespawnMs(nowMs: number): number {
  return nowMs + RAID_TTL_MS;
}

export type RaidRow = {
  id: string;
  skill_tag: string;
  rarity: string;
  current_hp: number;
  max_hp: number;
  despawn_at: string;
};

export type PublicRaid = RaidRow & { name: string; seconds_left: number };

// Public strip: exactly the banner fields — questions never leave the server.
export function toPublicRaid(row: RaidRow, name: string, nowMs: number = Date.now()): PublicRaid {
  return {
    id: row.id,
    skill_tag: row.skill_tag,
    name,
    rarity: row.rarity,
    current_hp: row.current_hp,
    max_hp: row.max_hp,
    despawn_at: row.despawn_at,
    seconds_left: Math.max(0, Math.floor((Date.parse(row.despawn_at) - nowMs) / 1000)),
  };
}

const RaidSetShape = z.array(BossQuestion).length(5);

// Read-only cache check for the raid cron: a stored verified set, or null
// when the cache is empty (the caller skips — zero LLM cost in cron, and the
// prime cron warms the cache). Same set version and validity rule as the
// summon path, so a raid fight is always 5 verified questions.
export async function readRaidQuestions(
  supabase: SupabaseClient,
  skill_tag: string,
): Promise<BossQuestion[] | null> {
  try {
    const { data, error } = await supabase
      .from("boss_question_cache")
      .select("questions")
      .eq("skill_tag", skill_tag)
      .eq("set_version", BOSS_SET_VERSION)
      .maybeSingle();
    if (error || !data) return null;
    const parsed = RaidSetShape.safeParse((data as { questions: unknown }).questions);
    if (!parsed.success) return null;
    for (const q of parsed.data) {
      if (!verifyAnswer(q.check, q.answer_numeric, q.tolerance)) return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

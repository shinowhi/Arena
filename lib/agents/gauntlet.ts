import { z } from "zod";
import type { BossQuestion } from "./boss-generator";

// Gauntlet Boss: one boss, five skills. Level i comes from skill i, so a
// single fight reviews five different gaps. Question sets are the cached
// per-skill templates, so a gauntlet usually costs zero LLM calls.

export const GauntletSkills = z.object({ skills: z.array(z.string().min(1)).length(5) });
export type GauntletSkills = z.infer<typeof GauntletSkills>;

// Player's weakest-first skills, topped up with cache-available ones.
export function pickGauntletSkills(playerSkills: string[], cachedSkills: string[], fallback: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of [playerSkills, cachedSkills, fallback]) {
    for (const s of list) {
      if (typeof s !== "string" || s.length === 0 || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

// Level i+1 question from set i (sets sorted by level first). Each set must
// hold at least 5 questions; shorter sets are skipped.
export function buildGauntletQuestions(sets: BossQuestion[][]): BossQuestion[] {
  const out: BossQuestion[] = [];
  for (let i = 0; i < 5; i++) {
    const set = sets[i];
    if (!Array.isArray(set) || set.length < 5) continue;
    const sorted = [...set].sort((a, b) => a.level - b.level);
    out.push(sorted[i]);
  }
  return out;
}

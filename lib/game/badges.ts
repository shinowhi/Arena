import { z } from "zod";

// Weekly badges: derived from scans/attacks/bosses each load, no storage or
// migration. All badges evaluate trailing-7-day activity.

export const Badge = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  earned: z.boolean(),
  progress: z.number().int().min(0),
  target: z.number().int().positive(),
});
export type Badge = z.infer<typeof Badge>;

export type BadgeCounts = {
  scans: number;
  correctHits: number;
  activeDays: number;
  slain: number;
  bestBossCorrect: number;
};

export type AttackRow = { boss_id: string; question_index: number; correct: boolean; created_at: string };
export type ScanRow = { created_at: string };

// Derives badge counts from raw rows. Hits count DISTINCT (boss, question)
// pairs so replaying one correct answer cannot farm Sharpshooter/Flawless.
export function countBadgeStats(attacks: AttackRow[], scans: ScanRow[], slain: number): BadgeCounts {
  const days = new Set<string>();
  for (const r of scans) {
    if (typeof r.created_at === "string") days.add(r.created_at.slice(0, 10));
  }
  const seen = new Set<string>();
  const perBoss = new Map<string, Set<number>>();
  let correctHits = 0;
  for (const a of attacks) {
    if (typeof a.created_at === "string") days.add(a.created_at.slice(0, 10));
    if (!a.correct) continue;
    const key = `${a.boss_id}:${a.question_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    correctHits += 1;
    let set = perBoss.get(a.boss_id);
    if (!set) {
      set = new Set();
      perBoss.set(a.boss_id, set);
    }
    set.add(a.question_index);
  }
  let bestBossCorrect = 0;
  for (const s of perBoss.values()) bestBossCorrect = Math.max(bestBossCorrect, s.size);
  return { scans: scans.length, correctHits, activeDays: days.size, slain, bestBossCorrect };
}

export function evaluateBadges(c: BadgeCounts): Badge[] {
  const mk = (
    id: string,
    name: string,
    desc: string,
    progress: number,
    target: number,
  ): Badge => ({ id, name, desc, earned: progress >= target, progress, target });
  return [
    mk("first_blood", "First Blood", "Land 1 correct hit this week.", c.correctHits, 1),
    mk("sharpshooter", "Sharpshooter", "Land 10 correct hits this week.", c.correctHits, 10),
    mk("slayer", "Slayer", "Slay 1 of your own bosses this week.", c.slain, 1),
    mk("scholar", "Scholar", "Scan 3 times this week.", c.scans, 3),
    mk("grinder", "Grinder", "Be active on 3 different days this week.", c.activeDays, 3),
    mk("flawless", "Flawless", "Answer 5/5 on one boss this week.", c.bestBossCorrect, 5),
  ];
}

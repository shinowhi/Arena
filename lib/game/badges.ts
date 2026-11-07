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
    mk("scholar", "Scholar", "Scan 3 works this week.", c.scans, 3),
    mk("grinder", "Grinder", "Be active on 3 different days this week.", c.activeDays, 3),
    mk("flawless", "Flawless", "Answer 5/5 on one boss this week.", c.bestBossCorrect, 5),
  ];
}

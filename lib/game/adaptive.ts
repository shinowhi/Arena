// Adaptive drill engine (Day 3): per-skill ELO rating picks the next level,
// SM-2-lite schedules reviews of missed questions. Pure + serializable: the
// rating/SM-2 math runs anywhere (client holds state, server holds cache).
// Mirror-tested offline in test-adaptive.mjs.

export const ADAPT_K = 24;
export const START_RATING = 1000;

// Question rating from boss level: L1=900 … L5=1300.
export function levelRating(level: number): number {
  const l = Math.min(5, Math.max(1, Math.round(level)));
  return 800 + l * 100;
}

// Standard ELO step of the SKILL rating against the question rating.
export function updateRating(rating: number, level: number, correct: boolean): number {
  const q = levelRating(level);
  const expected = 1 / (1 + Math.pow(10, (q - rating) / 400));
  return Math.round(rating + ADAPT_K * ((correct ? 1 : 0) - expected));
}

// Level the player should face next at this rating. Fresh skills start at
// 1000 → Lv2 by design (Lv1 is the recovery floor after losses).
export function levelForRating(rating: number): number {
  if (rating < 950) return 1;
  if (rating < 1050) return 2;
  if (rating < 1150) return 3;
  if (rating < 1250) return 4;
  return 5;
}

// SM-2-lite: reps = consecutive quality>=3 recalls. Client sends 5
// (first-try correct) or 0 (wrong); quality 3 is reserved for a future
// retry-credit mode. Returns next {reps, intervalDays}.
export function sm2Next(reps: number, intervalDays: number, quality: number): { reps: number; intervalDays: number } {
  if (quality < 3) return { reps: 0, intervalDays: 1 };
  const r = reps + 1;
  if (r === 1) return { reps: r, intervalDays: 1 };
  if (r === 2) return { reps: r, intervalDays: 6 };
  return { reps: r, intervalDays: Math.round(intervalDays * 2.5) };
}

export type SkillStat = { rating: number; games: number };

// Lowest-rated skill with the fewest games wins; unknown skills start fresh.
export function lowestRated(stats: Record<string, SkillStat>, candidates: string[]): string | null {
  let best: string | null = null;
  let bestKey = "";
  for (const id of candidates) {
    const s = stats[id] ?? { rating: START_RATING, games: 0 };
    // Rating buckets of 25 keep near-ties stable; fewer games first.
    const key = `${String(Math.floor(s.rating / 25)).padStart(6, "0")}:${String(s.games).padStart(6, "0")}:${id}`;
    if (best === null || key < bestKey) {
      best = id;
      bestKey = key;
    }
  }
  return best;
}

import type { TodayItem } from "@/lib/mastery/today";

// P4.4 homework nudges: rule-based, NO LLM. Narrows the mastery "today" list
// (lib/mastery/today.ts, reused read-only by the nudge route) to the top-2
// actionable items: due recalls first, then weak rebuilds, then anything else
// in order — so the card stays useful when nothing is strictly due, and
// unknown visitors still get the generic fresh-drill fallback. Mirror-tested
// in scripts/test-tutor-threads.mjs. Labels + hrefs only — never answers/keys.
export const NUDGE_MAX = 2;

export function pickNudges(items: TodayItem[]): TodayItem[] {
  const priority = items.filter((i) => i.reason === "due" || i.reason === "weak");
  const rest = items.filter((i) => i.reason !== "due" && i.reason !== "weak");
  return [...priority, ...rest].slice(0, NUDGE_MAX);
}

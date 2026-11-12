// Mastery engine (P4.2): pure per-skill mastery from existing attempt, scan,
// and slain data. No DB, no clock inside — callers pass rows with ISO
// timestamps. Mirror-tested offline in test-mastery.mjs.

export type MasteryAttempt = { skill_tag: string; correct: boolean; at: string };
export type MasteryScan = { weak_skill: string; at: string };
export type MasteryTrend = "up" | "flat" | "down";
export type MasteryStatus = "solid" | "shaky" | "weak" | "new";

export type SkillMastery = {
  tag: string;
  mastery: number | null; // 0..100, null when under MIN_ATTEMPTS ("new")
  status: MasteryStatus;
  trend: MasteryTrend;
  total: number;
  right: number;
  last_at: string | null;
};

export const MASTERY_WINDOW = 20;
export const MIN_ATTEMPTS = 3;
export const SLAIN_BONUS = 15;
export const STALE_SCAN_PENALTY = 10;

export function statusFor(mastery: number | null): MasteryStatus {
  if (mastery === null) return "new";
  if (mastery >= 80) return "solid";
  if (mastery >= 50) return "shaky";
  return "weak";
}

// String compare is valid: Supabase returns UTC ISO timestamps, which sort
// lexicographically (same assumption as today.ts SM-2 replay ordering).
function cmpTime(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

// Per-skill mastery over the union of attempted + scanned tags. Base is
// accuracy over the last MASTERY_WINDOW attempts (min MIN_ATTEMPTS, else
// null); a slain boss adds SLAIN_BONUS (cap 100); a weak_skill scan newer
// than the last attempt subtracts STALE_SCAN_PENALTY (floor 0). Trend
// compares most-recent-5 accuracy against the 5 before (needs 10+, else
// flat). Output is weak-first to match the dashboard grouping.
export function computeMastery(
  attempts: MasteryAttempt[],
  scans: MasteryScan[],
  slain: string[],
): SkillMastery[] {
  const slainSet = new Set(slain);
  const bySkill = new Map<string, MasteryAttempt[]>();
  for (const a of attempts) {
    if (!a.skill_tag) continue;
    const list = bySkill.get(a.skill_tag) ?? [];
    list.push(a);
    bySkill.set(a.skill_tag, list);
  }
  const lastScanAt = new Map<string, string>();
  for (const s of scans) {
    if (!s.weak_skill) continue;
    const prev = lastScanAt.get(s.weak_skill);
    if (!prev || cmpTime(prev, s.at) < 0) lastScanAt.set(s.weak_skill, s.at);
  }
  const out: SkillMastery[] = [];
  for (const tag of new Set<string>([...bySkill.keys(), ...lastScanAt.keys()])) {
    const list = (bySkill.get(tag) ?? []).slice().sort((x, y) => cmpTime(x.at, y.at));
    const total = list.length;
    const right = list.filter((a) => a.correct).length;
    const last_at = total > 0 ? list[total - 1].at : null;
    let mastery: number | null = null;
    if (total >= MIN_ATTEMPTS) {
      const window = list.slice(-MASTERY_WINDOW);
      const wins = window.filter((a) => a.correct).length;
      let score = Math.round((wins / window.length) * 100);
      if (slainSet.has(tag)) score = Math.min(100, score + SLAIN_BONUS);
      const scanAt = lastScanAt.get(tag);
      if (scanAt && (!last_at || cmpTime(last_at, scanAt) < 0)) {
        score = Math.max(0, score - STALE_SCAN_PENALTY);
      }
      mastery = score;
    }
    let trend: MasteryTrend = "flat";
    if (total >= 10) {
      const acc = (w: MasteryAttempt[]) => w.filter((a) => a.correct).length / w.length;
      const d = acc(list.slice(-5)) - acc(list.slice(-10, -5));
      trend = d > 0 ? "up" : d < 0 ? "down" : "flat";
    }
    out.push({ tag, mastery, status: statusFor(mastery), trend, total, right, last_at });
  }
  const rank = (s: MasteryStatus) => (s === "weak" ? 0 : s === "shaky" ? 1 : s === "solid" ? 2 : 3);
  out.sort((x, y) => rank(x.status) - rank(y.status) || (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0));
  return out;
}

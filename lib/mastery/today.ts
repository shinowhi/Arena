// "Practice today" picker (P4.2): pure ordering over computed mastery plus
// an SM-2 due list. Due dates are derived server-side by replaying each
// skill's attempts (oldest first) through adaptive's sm2Next — the ratings
// the adaptive client holds are NOT needed, because sm2Next only needs the
// quality sequence (correct → 5, wrong → 0) and the last review time. Every
// href is a REAL route: /drill with ?skill= preselect (supported by the
// drill hub) or plain /drill. Mirror-tested in test-mastery.mjs.
import { sm2Next } from "@/lib/game/adaptive";
import { isValidSkill, skillName } from "@/lib/graph/skills";
import type { MasteryAttempt, SkillMastery } from "./compute";

export type TodayReason = "due" | "weak" | "shaky" | "new";
export type TodayItem = { label: string; href: string; reason: TodayReason };

export const DAY_MS = 86_400_000;
export const RECENT_MS = 14 * DAY_MS;

function drillHref(tag: string): string {
  return `/drill?skill=${encodeURIComponent(tag)}`;
}

// Skills whose SM-2 interval has elapsed since their last attempt, most
// overdue first. Skills with no attempts have no schedule and never appear.
export function dueSkillsForReview(attempts: MasteryAttempt[], nowMs: number = Date.now()): string[] {
  const bySkill = new Map<string, MasteryAttempt[]>();
  for (const a of attempts) {
    if (!a.skill_tag || !isValidSkill(a.skill_tag)) continue;
    if (Number.isNaN(new Date(a.at).getTime())) continue;
    const list = bySkill.get(a.skill_tag) ?? [];
    list.push(a);
    bySkill.set(a.skill_tag, list);
  }
  const due: Array<{ tag: string; overdueMs: number }> = [];
  for (const [tag, list] of bySkill) {
    list.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
    let reps = 0;
    let intervalDays = 1;
    for (const a of list) {
      const next = sm2Next(reps, intervalDays, a.correct ? 5 : 0);
      reps = next.reps;
      intervalDays = next.intervalDays;
    }
    const lastAt = new Date(list[list.length - 1].at).getTime();
    const overdueMs = nowMs - (lastAt + intervalDays * DAY_MS);
    if (overdueMs >= 0) due.push({ tag, overdueMs });
  }
  due.sort((x, y) => y.overdueMs - x.overdueMs || (x.tag < y.tag ? -1 : 1));
  return due.map((d) => d.tag);
}

// Ordered today list, max 5: (1) SM-2 due skills, (2) weak skills with
// recent activity, (3) one shaky skill to consolidate, (4) fallback to a
// fresh drill when nothing qualifies. Deduped by skill, due order kept.
export function pickToday(
  mastery: SkillMastery[],
  dueSkills: string[],
  nowMs: number = Date.now(),
): TodayItem[] {
  const items: TodayItem[] = [];
  const seen = new Set<string>();
  const push = (tag: string, label: string, reason: TodayReason) => {
    if (seen.has(tag) || items.length >= 5 || !isValidSkill(tag)) return;
    seen.add(tag);
    items.push({ label, href: drillHref(tag), reason });
  };
  for (const tag of dueSkills) {
    push(tag, `Review ${skillName(tag)} — due for recall`, "due");
  }
  const recentWeak = mastery
    .filter(
      (m) =>
        m.status === "weak" &&
        m.last_at !== null &&
        !Number.isNaN(new Date(m.last_at).getTime()) &&
        nowMs - new Date(m.last_at).getTime() <= RECENT_MS,
    )
    .sort((x, y) => (x.mastery ?? 0) - (y.mastery ?? 0));
  for (const m of recentWeak) {
    push(m.tag, `Rebuild ${skillName(m.tag)} — your weakest link`, "weak");
  }
  const shaky = mastery
    .filter((m) => m.status === "shaky")
    .sort((x, y) => (y.mastery ?? 0) - (x.mastery ?? 0))[0];
  if (shaky) push(shaky.tag, `Consolidate ${skillName(shaky.tag)} — almost solid`, "shaky");
  if (items.length === 0) {
    items.push({ label: "Start a fresh drill on any topic", href: "/drill", reason: "new" });
  }
  return items.slice(0, 5);
}

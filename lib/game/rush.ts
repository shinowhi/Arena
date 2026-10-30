import { SKILL_IDS } from "@/lib/graph/skills";

// Deterministic daily seed: same skill for everyone, zero state.
export function rushDayIndex(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 86400000);
}

export function rushSkill(dayIndex: number): string {
  return SKILL_IDS[((dayIndex % SKILL_IDS.length) + SKILL_IDS.length) % SKILL_IDS.length];
}

export function rushDayString(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function rushResetAt(nowMs: number = Date.now()): string {
  return new Date((Math.floor(nowMs / 86400000) + 1) * 86400000).toISOString();
}
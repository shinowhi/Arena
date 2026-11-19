import { buildMock, type MockConfig, type MockQuestion, type MockSet } from "../agents/thpt.ts";
import { SKILL_IDS, skillSubject } from "../graph/skills.ts";

// THPT Physics mock wiring (Vat ly 10-12). Papers assemble cached verified
// boss sets: zero LLM at serve time. Skill order rotates daily inside
// buildMock (FNV hash of skill+date) so "today's paper" is stable all day
// and fresh tomorrow. Levels cycle per skill for an easy→hard mix.

// Real THPT physics: 40 questions / 50 minutes. 20 cached skills × 2.
export const PHYSICS_EXAM_MINUTES = 50;
export const PHYSICS_MOCK_COUNT = 40;

export const PHYSICS_MOCK_CONFIG: MockConfig = {
  skillsPerMock: 20,
  perSkill: 2,
  levels: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]],
};

// Forge spec for a future verified-tier THPT Physics exam section (prime
// script + exam config wiring stays with the parent; this pins the shape).
export const PHYSICS_EXAM_SPEC = {
  sectionId: "thpt_physics",
  tier: "verified",
  count: PHYSICS_MOCK_COUNT,
  subject:
    "THPT Physics (Vat ly 10-12): mechanics, electricity and magnetism, oscillations and waves, optics, modern physics. Write statements in Vietnamese.",
} as const;

export function poolPhysicsSkills(ids: string[] = SKILL_IDS): string[] {
  return ids.filter((id) => skillSubject(id) === "physics");
}

export function buildPhysicsMock(sets: MockSet[], dateStr: string): MockQuestion[] {
  return buildMock(sets, dateStr, PHYSICS_MOCK_CONFIG);
}

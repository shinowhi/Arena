import { buildMock, type MockConfig, type MockQuestion, type MockSet } from "../agents/thpt.ts";
import { SKILL_IDS, skillSubject } from "../graph/skills.ts";

// THPT Chemistry mock wiring (Hoa hoc 10-12). Papers assemble cached verified
// boss sets: zero LLM at serve time. Skill order rotates daily inside
// buildMock (FNV hash of skill+date) so "today's paper" is stable all day
// and fresh tomorrow. Levels cycle per skill for an easy→hard mix.

// Real THPT chemistry: 40 questions / 50 minutes. 20 cached skills × 2.
export const CHEMISTRY_EXAM_MINUTES = 50;
export const CHEMISTRY_MOCK_COUNT = 40;

export const CHEMISTRY_MOCK_CONFIG: MockConfig = {
  skillsPerMock: 20,
  perSkill: 2,
  levels: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]],
};

// Forge spec for a future verified-tier THPT Chemistry exam section (prime
// script + exam config wiring stays with the parent; this pins the shape).
export const CHEMISTRY_EXAM_SPEC = {
  sectionId: "thpt_chemistry",
  tier: "verified",
  count: CHEMISTRY_MOCK_COUNT,
  subject:
    "THPT Chemistry (Hoa hoc 10-12): inorganic, organic, calculations. Write statements in Vietnamese.",
} as const;

export function poolChemistrySkills(ids: string[] = SKILL_IDS): string[] {
  return ids.filter((id) => skillSubject(id) === "chemistry");
}

export function buildChemistryMock(sets: MockSet[], dateStr: string): MockQuestion[] {
  return buildMock(sets, dateStr, CHEMISTRY_MOCK_CONFIG);
}

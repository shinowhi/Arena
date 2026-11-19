import { buildMock, MockQuestion, type MockConfig } from "../agents/thpt.ts";
import { SKILL_IDS, skillSubject } from "../graph/skills.ts";
import type { EnglishBossBase } from "./drill.ts";

// THPT English mock wiring (Tieng Anh 10-12). Papers assemble cached
// rule-verified boss sets: zero LLM at serve time. Skill order rotates
// daily inside buildMock (FNV hash of skill+date) so "today's paper" is
// stable all day and fresh tomorrow. Levels cycle per skill for an
// easy→hard mix.

// Real THPT English: 40 questions / 60 minutes. 20 cached skills × 2.
export const ENGLISH_EXAM_MINUTES = 60;
export const ENGLISH_MOCK_COUNT = 40;

export const ENGLISH_MOCK_CONFIG: MockConfig = {
  skillsPerMock: 20,
  perSkill: 2,
  levels: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]],
};

// Forge spec for a future draft-tier THPT English exam section (prime
// script + exam config wiring stays with the parent; this pins the shape).
// Draft, not verified: English keys are cross-answer checked, never
// machine-recomputed, matching the V-ACT/HSA English sections.
export const ENGLISH_EXAM_SPEC = {
  sectionId: "thpt_english",
  tier: "draft",
  count: ENGLISH_MOCK_COUNT,
  subject:
    "THPT English (Tieng Anh 10-12): grammar, vocabulary, pronunciation, cloze test, reading comprehension. Write instructions in Vietnamese, tested content in English.",
} as const;

export function poolEnglishSkills(ids: string[] = SKILL_IDS): string[] {
  return ids.filter((id) => skillSubject(id) === "english");
}

export type EnglishMockSet = { skill_tag: string; skill_name: string; questions: EnglishBossBase[] };

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

// Client-safe mock question: the stem carries lettered options (and the
// passage for reading sets) so the numeric-input client answers with an
// option index 0-3, graded exactly (tolerance 0.001) against the cached
// full set server-side. answer_index + explanation NEVER ship: check only
// declares the choice shape, never the key.
export function stripEnglishMockQ(q: EnglishBossBase): {
  level: number;
  prompt_latex: string;
  hint: string;
  tolerance: number;
  check: { kind: "choice"; options: 4 };
} {
  const stem = [q.prompt_latex, ...q.options.map((o, k) => `${OPTION_LETTERS[k]}. ${o}`)];
  if (q.passage) stem.push(`Passage: ${q.passage}`);
  return {
    level: q.level,
    prompt_latex: stem.join("\n"),
    hint: q.hint,
    tolerance: 0.001,
    check: { kind: "choice", options: 4 },
  };
}

export function buildEnglishMock(sets: EnglishMockSet[], dateStr: string): MockQuestion[] {
  const stripped = sets.map((s) => ({
    skill_tag: s.skill_tag,
    skill_name: s.skill_name,
    questions: s.questions.map(stripEnglishMockQ),
  }));
  const out = buildMock(stripped, dateStr, ENGLISH_MOCK_CONFIG);
  // Every shipped row MUST satisfy the shared MockQuestion contract (the
  // way the math route validates): parse here so a shape drift fails loud
  // in tests, not silently in a future route.
  return out.map((q) => MockQuestion.parse(q));
}

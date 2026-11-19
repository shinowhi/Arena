import { z } from "zod";

// English drill-set wiring: assemble keyed server-side drill papers from
// cached per-skill multiple-choice sets (round-robin across skills, level
// by level, same interleave as the weak-skills drill source). The server
// stores the FULL paper WITH keys; stripEnglishDrill removes answer_index
// AND the explanation before anything reaches the client.

// NOTE: English questions are multiple-choice (options + answer_index),
// so they intentionally do NOT mirror the numeric BossQuestion /
// DrillQuestion / StrippedDrillQ contracts from the math pipeline. There
// is no shared MCQ drill contract to lock against; the exam forge output
// matches the shared ExamQuestion shape instead (tier "draft").

export const EnglishDrillQuestion = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  answer_index: z.number().int().min(0).max(3),
  hint: z.string(),
  passage: z.string().optional(),
  explanation: z.string().min(1),
  skill_tag: z.string().min(1),
});
export type EnglishDrillQuestion = z.infer<typeof EnglishDrillQuestion>;

export const EnglishBossBase = EnglishDrillQuestion.omit({ skill_tag: true });
export type EnglishBossBase = z.infer<typeof EnglishBossBase>;

export const EnglishDrillPaper = z.object({
  questions: z.array(EnglishDrillQuestion).min(1).max(20),
});
export type EnglishDrillPaper = z.infer<typeof EnglishDrillPaper>;

// Client-safe question: no answer_index, no explanation.
export const StrippedEnglishDrillQ = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  hint: z.string(),
  passage: z.string().optional(),
  skill_tag: z.string().min(1),
});
export type StrippedEnglishDrillQ = z.infer<typeof StrippedEnglishDrillQ>;

export function stripEnglishDrill(paper: EnglishDrillPaper): { questions: StrippedEnglishDrillQ[] } {
  return {
    questions: paper.questions.map((q) => ({
      level: q.level,
      prompt_latex: q.prompt_latex,
      options: q.options,
      hint: q.hint,
      ...(q.passage === undefined ? {} : { passage: q.passage }),
      skill_tag: q.skill_tag,
    })),
  };
}

export type EnglishDrillSet = {
  skill_tag: string;
  questions: EnglishBossBase[];
};

export const ENGLISH_DRILL_MIN_COUNT = 5;
export const ENGLISH_DRILL_MAX_COUNT = 20;
export const ENGLISH_DRILL_DEFAULT_COUNT = 10;

export function clampEnglishCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : ENGLISH_DRILL_DEFAULT_COUNT;
  return Math.min(ENGLISH_DRILL_MAX_COUNT, Math.max(ENGLISH_DRILL_MIN_COUNT, v));
}

// Round-robin interleave: level 1 of every skill, then level 2, and so on.
// Empty sets are skipped; each set is level-sorted first so the mix stays
// easy→hard even when cache order drifts.
export function interleaveEnglishDrills(sets: EnglishDrillSet[], count: number): EnglishDrillQuestion[] {
  const want = clampEnglishCount(count);
  const sorted = sets.map((s) => ({
    skill_tag: s.skill_tag,
    questions: [...s.questions].sort((a, b) => a.level - b.level),
  }));
  const out: EnglishDrillQuestion[] = [];
  const depth = Math.max(0, ...sorted.map((s) => s.questions.length));
  for (let i = 0; i < depth && out.length < want; i++) {
    for (const s of sorted) {
      if (out.length >= want) break;
      const q = s.questions[i];
      if (q) out.push({ ...q, skill_tag: s.skill_tag });
    }
  }
  return out;
}

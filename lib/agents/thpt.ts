import { z } from "zod";

// Exam-mock engine (THPTQG first, V-SAT/ĐGNL reuse the same builder).
// Mocks assemble cached verified sets: zero LLM at serve time. Skill order
// rotates daily (FNV hash of skill+date) so "today's paper" is stable all day
// and fresh tomorrow. Levels cycle per skill for a realistic easy→hard mix.

export const StrippedQ = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  hint: z.string(),
  tolerance: z.number().positive(),
  check: z.unknown(),
});

export const MockQuestion = StrippedQ.extend({
  skill_tag: z.string().min(1),
  skill_name: z.string().min(1),
});
export type MockQuestion = z.infer<typeof MockQuestion>;

// Cache rows carry no skill fields; buildMock stamps them on.
export type MockSet = { skill_tag: string; skill_name: string; questions: z.infer<typeof StrippedQ>[] };

export type MockConfig = {
  skillsPerMock: number;
  perSkill: number;
  // levels[i] = level offsets for the i-th picked skill (cycled).
  levels: number[][];
};

export const THPT_CONFIG: MockConfig = {
  skillsPerMock: 25,
  perSkill: 2,
  levels: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]],
};

// FNV-1a 32-bit, deterministic across runtimes.
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rotateSkills(skills: string[], dateStr: string, count: number): string[] {
  return [...skills]
    .sort((a, b) => fnv1a(a + dateStr) - fnv1a(b + dateStr))
    .slice(0, count);
}

// Levels index into each skill's level-sorted set (level L = position L-1).
export function buildMock(sets: MockSet[], dateStr: string, config: MockConfig): MockQuestion[] {
  const order = rotateSkills(
    sets.map((s) => s.skill_tag),
    dateStr,
    config.skillsPerMock,
  );
  const byId = new Map(sets.map((s) => [s.skill_tag, s]));
  const out: MockQuestion[] = [];
  order.forEach((tag, j) => {
    const set = byId.get(tag);
    if (!set) return;
    const sorted = [...set.questions].sort((a, b) => a.level - b.level);
    const want = config.levels[j % config.levels.length].slice(0, config.perSkill);
    for (const lv of want) {
      const q = sorted[lv - 1];
      if (q) out.push({ ...q, skill_tag: set.skill_tag, skill_name: set.skill_name });
    }
  });
  return out;
}

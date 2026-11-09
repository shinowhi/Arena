import { z } from "zod";
import { CheckSpecSchema } from "./boss-generator";

// Shared multiple-choice exam engine (V-ACT + HSA).
// Exam papers assemble cached verified/draft sets: zero LLM at serve time.
// Cache rows refresh every 2 days via prime-exam-cache; readers always take
// the latest row per section, so a paper is NEVER half-old half-new.

// Exam sets live in boss_question_cache with their own version, apart from
// boss templates (v1). Bump together with prime-exam-cache.mjs.
export const EXAM_SET_VERSION = 2;

// Server-side MC question. answer_index + check NEVER leave the server:
// the mock API strips them, and /api/exam/grade re-reads them from cache.
export const ExamQuestion = z.object({
  prompt_latex: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  answer_index: z.number().int().min(0).max(3),
  tier: z.enum(["verified", "draft"]),
  check: CheckSpecSchema.optional(),
  tolerance: z.number().positive().optional(),
});
export type ExamQuestion = z.infer<typeof ExamQuestion>;

// Client-safe question: no key, no computation spec.
export const StrippedExamQ = z.object({
  no: z.number().int().positive(),
  prompt_latex: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  tier: z.enum(["verified", "draft"]),
});
export type StrippedExamQ = z.infer<typeof StrippedExamQ>;

export type ExamSection = {
  id: string;
  name: string;
  count: number;
  minutes: number;
  tier: "verified" | "draft";
  firstNo: number;
  // HSA part 3: the candidate picks ONE of the grouped sections.
  choice?: string;
};

export type ExamConfig = {
  id: "vact" | "hsa";
  name: string;
  clock: "single" | "per_section";
  totalMinutes: number;
  pointsPerQ: number;
  scale: number;
  sections: ExamSection[];
};

// V-ACT = ĐGNL ĐHQG-HCM, APT form 2025: 120Q / 150min / scale 1200.
export const VACT_CONFIG: ExamConfig = {
  id: "vact",
  name: "V-ACT",
  clock: "single",
  totalMinutes: 150,
  pointsPerQ: 10,
  scale: 1200,
  sections: [
    { id: "vact_vietnamese", name: "Vietnamese", count: 30, minutes: 150, tier: "draft", firstNo: 1 },
    { id: "vact_english", name: "English", count: 30, minutes: 150, tier: "draft", firstNo: 31 },
    { id: "vact_math", name: "Mathematics", count: 30, minutes: 150, tier: "verified", firstNo: 61 },
    { id: "vact_logic", name: "Logic & data", count: 12, minutes: 150, tier: "draft", firstNo: 91 },
    { id: "vact_scireason", name: "Science reasoning", count: 18, minutes: 150, tier: "draft", firstNo: 103 },
  ],
};

// HSA = ĐGNL ĐHQG Hà Nội 2025: 150Q / scale 150, per-section clocks.
export const HSA_CONFIG: ExamConfig = {
  id: "hsa",
  name: "HSA",
  clock: "per_section",
  totalMinutes: 195,
  pointsPerQ: 1,
  scale: 150,
  sections: [
    { id: "hsa_math", name: "Math & data", count: 50, minutes: 75, tier: "verified", firstNo: 1 },
    { id: "hsa_literature", name: "Literature & language", count: 50, minutes: 60, tier: "draft", firstNo: 51 },
    { id: "hsa_science", name: "Science", count: 50, minutes: 60, tier: "draft", firstNo: 101, choice: "p3" },
    { id: "hsa_english", name: "English", count: 50, minutes: 60, tier: "draft", firstNo: 101, choice: "p3" },
  ],
};

export function examConfig(id: string): ExamConfig | null {
  if (id === "vact") return VACT_CONFIG;
  if (id === "hsa") return HSA_CONFIG;
  return null;
}

// 2-day epoch: papers regenerate every 2 days, stable within the window.
const DAY_MS = 86400000;
export function epoch2(dateStr: string): number {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new Error("Bad date");
  return Math.floor(ms / DAY_MS / 2);
}

export function activeSections(config: ExamConfig, p3?: string): ExamSection[] {
  const fixed = config.sections.filter((s) => !s.choice);
  const group = config.sections.filter((s) => s.choice);
  if (group.length === 0) return fixed;
  const pick = group.find((s) => s.id === p3) ?? null;
  return pick ? [...fixed, pick] : fixed;
}

export type CacheRow = { skill_tag: string; questions: ExamQuestion[]; fetched_at: string };

export type AssembledSection = {
  id: string;
  name: string;
  minutes: number;
  tier: "verified" | "draft";
  as_of: string;
  questions: StrippedExamQ[];
};

// Stamps global numbers and strips server-only fields. Throws when a section
// row is missing or short — the route turns that into a 503 warm-up message.
export function assembleExam(rows: CacheRow[], config: ExamConfig, p3?: string): AssembledSection[] {
  const byId = new Map(rows.map((r) => [r.skill_tag, r]));
  return activeSections(config, p3).map((s) => {
    const row = byId.get(s.id);
    if (!row || !Array.isArray(row.questions) || row.questions.length < s.count) {
      throw new Error(`section ${s.id} not ready`);
    }
    return {
      id: s.id,
      name: s.name,
      minutes: s.minutes,
      tier: s.tier,
      as_of: row.fetched_at,
      questions: row.questions.slice(0, s.count).map((q, i) => ({
        no: s.firstNo + i,
        prompt_latex: q.prompt_latex,
        options: q.options,
        tier: q.tier,
      })),
    };
  });
}

// Server-side grading: compare the picked option against the cached key.
export function gradeSelection(q: ExamQuestion, selected: number): boolean {
  return Number.isInteger(selected) && selected >= 0 && selected <= 3 && selected === q.answer_index;
}

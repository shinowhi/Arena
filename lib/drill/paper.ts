import { z } from "zod";
import { BossQuestion } from "@/lib/agents/boss-generator";

// Shared drill-set paper contract (P4.1). The server stores FULL questions
// WITH answer keys in drill_sets.paper; the GET route strips them via
// stripDrillPaper and the submit route grades against the stored keys.
// Unlike papers, the check spec is stripped too: the client never grades
// locally, so it never needs the computation shape.

export const DrillQuestion = BossQuestion.extend({ skill_tag: z.string().min(1) });
export type DrillQuestion = z.infer<typeof DrillQuestion>;

export const DrillPaper = z.object({
  questions: z.array(DrillQuestion).min(1).max(20),
});
export type DrillPaper = z.infer<typeof DrillPaper>;

// Client-safe question: no answer_numeric, no check spec.
export const StrippedDrillQ = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  hint: z.string(),
  tolerance: z.number().positive(),
  skill_tag: z.string().min(1),
});
export type StrippedDrillQ = z.infer<typeof StrippedDrillQ>;

export function stripDrillPaper(paper: DrillPaper): { questions: StrippedDrillQ[] } {
  return {
    questions: paper.questions.map((q) => ({
      level: q.level,
      prompt_latex: q.prompt_latex,
      hint: q.hint,
      tolerance: q.tolerance,
      skill_tag: q.skill_tag,
    })),
  };
}

export const DRILL_MIN_COUNT = 5;
export const DRILL_MAX_COUNT = 20;
export const DRILL_DEFAULT_COUNT = 10;

// Clamp a requested set size into range; garbage means the default.
export function clampCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DRILL_DEFAULT_COUNT;
  return Math.min(DRILL_MAX_COUNT, Math.max(DRILL_MIN_COUNT, v));
}

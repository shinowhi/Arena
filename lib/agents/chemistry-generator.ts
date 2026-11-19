import { z } from "zod";
import { chatJson, MetaLLMError } from "../llm/meta.ts";
import type { BossOutput as SharedBossOutput, BossQuestion as SharedBossQuestion } from "./boss-generator";
import type { ExamQuestion as SharedExamQuestion } from "./exam";
import { isValidSkill, skillGradeLabel, skillName, skillSubject } from "../graph/skills.ts";
import { recompute } from "../verify/math-verifier.ts";
import { verifyChemistryAnswer } from "../verify/chemistry-verifier.ts";
import {
  CHEMISTRY_EXAM_DISTRACTOR_SYSTEM,
  CHEMISTRY_EXAM_SYSTEM,
  CHEMISTRY_SYSTEM,
} from "./chemistry-prompts.ts";

// THPT Chemistry (Hoa hoc 10-12) generators. All LLM calls go through
// lib/llm/meta.ts with zod validation; every numeric answer is machine
// recomputed before it ships. Answers never reach the client: boss/drill
// routes strip them, exam routes strip keys via assembleExam.

// Runtime imports use explicit .ts extensions (and type-only imports for
// shared contracts) so plain node can import this module for offline
// tests: the repo's extensionless style does not resolve under node.
// The local schemas below mirror the shared boss contracts exactly;
// CHEMISTRY_CONTRACTS_LOCKED breaks tsc if either side drifts.
export const ChemistryCheckSpec = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);

export const ChemistryBossQuestion = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  hint: z.string(),
  check: ChemistryCheckSpec,
});

export const ChemistryBossOutput = z.object({ questions: z.array(ChemistryBossQuestion).length(5) });

type ChemistryBossOutputShape = z.infer<typeof ChemistryBossOutput>;
type ChemistryBossQuestionShape = z.infer<typeof ChemistryBossQuestion>;

export const CHEMISTRY_CONTRACTS_LOCKED: [
  ChemistryBossOutputShape extends SharedBossOutput ? true : never,
  SharedBossOutput extends ChemistryBossOutputShape ? true : never,
  ChemistryBossQuestionShape extends SharedBossQuestion ? true : never,
  SharedBossQuestion extends ChemistryBossQuestionShape ? true : never,
] = [true, true, true, true];

export async function generateChemistryBossQuestions(skill_tag: string): Promise<SharedBossOutput> {
  if (!isValidSkill(skill_tag)) throw new MetaLLMError(`Invalid skill_tag: ${skill_tag}`);
  if (skillSubject(skill_tag) !== "chemistry") throw new MetaLLMError(`Not a chemistry skill: ${skill_tag}`);
  let failed: ChemistryBossQuestionShape[] = [];
  for (let round = 0; round < 3; round++) {
    const extra =
      failed.length > 0
        ? `\nThese drafts FAILED machine verification, return a fresh set of 5 with corrected variants: ${JSON.stringify(failed)}`
        : "";
    const out = await chatJson(
      ChemistryBossOutput,
      [
        { role: "system", content: CHEMISTRY_SYSTEM },
        {
          role: "user",
          content: `Skill: ${skill_tag} (${skillName(skill_tag)}). Grade: ${skillGradeLabel(skill_tag)}.${extra}`,
        },
      ],
      { maxTokens: 8000, temperature: 0.7 },
    );
    failed = out.questions.filter((q) => !verifyChemistryAnswer(q.check, q.answer_numeric, q.tolerance));
    if (failed.length === 0) return out;
  }
  throw new MetaLLMError("Could not generate 5 verified chemistry questions after 3 rounds.");
}

// Verified-tier multiple-choice forge for a future THPT Chemistry paper:
// numeric source questions (machine recomputed) + arithmetic-checked
// distractors, shuffled. Mirrors the math path in subject-forge.ts.
const EXAM_BATCH = 5;

const ChemistrySourceQ = z.object({
  prompt_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  check: z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
});
const ChemistrySourceBatch = z.object({ questions: z.array(ChemistrySourceQ).length(EXAM_BATCH) });
const ChemistryDistractorSet = z.object({
  correct: z.string().min(1),
  distractors: z.array(z.string().min(1)).length(3),
});
const ChemistryDistractorBatch = z.object({ sets: z.array(ChemistryDistractorSet).min(1).max(EXAM_BATCH) });

function numOpt(s: string): number | null {
  const n = Number(s.replace(/\$/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function shuffled<T>(arr: T[]): { order: number[]; values: T[] } {
  const order = arr.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, values: order.map((k) => arr[k]) };
}

export async function forgeChemistryExamBatch(subject: string, avoid: string[]): Promise<SharedExamQuestion[]> {
  const gen = await chatJson(
    ChemistrySourceBatch,
    [
      { role: "system", content: CHEMISTRY_EXAM_SYSTEM },
      { role: "user", content: `Subject: ${subject}. Avoid these stems: ${(avoid.slice(-20).join(" || ") || "none")}.` },
    ],
    { maxTokens: 8000, temperature: 0.7 },
  );
  // Machine recompute FIRST: a wrong answer_numeric dies here, not later.
  const good = gen.questions.filter((q) => {
    try {
      return Math.abs(recompute(q.check) - q.answer_numeric) <= q.tolerance;
    } catch {
      return false;
    }
  });
  if (good.length === 0) return [];
  const dis = await chatJson(
    ChemistryDistractorBatch,
    [
      { role: "system", content: CHEMISTRY_EXAM_DISTRACTOR_SYSTEM },
      {
        role: "user",
        content: good.map((q, i) => `Q${i}: ${q.prompt_latex} (answer ${q.answer_numeric})`).join("\n"),
      },
    ],
    { maxTokens: 8000, temperature: 0.7 },
  );
  const out: SharedExamQuestion[] = [];
  good.forEach((q, i) => {
    const set = dis.sets[i];
    if (!set) return;
    try {
      const truth = recompute(q.check);
      const c = numOpt(set.correct);
      if (c === null || Math.abs(c - truth) > q.tolerance) return;
      const ds = set.distractors.map(numOpt);
      if (ds.some((d) => d === null)) return;
      const vals = ds as number[];
      // Distractors must be truly wrong AND pairwise distinct.
      if (vals.some((d) => Math.abs(d - truth) <= q.tolerance)) return;
      if (vals.some((d) => Math.abs(d - (c as number)) <= q.tolerance)) return;
      for (let a = 0; a < vals.length; a++) {
        for (let b = a + 1; b < vals.length; b++) {
          if (Math.abs(vals[a] - vals[b]) <= q.tolerance) return;
        }
      }
      const { order, values } = shuffled([set.correct, ...set.distractors]);
      out.push({
        prompt_latex: q.prompt_latex,
        options: values,
        answer_index: order.indexOf(0),
        tier: "verified",
        check: q.check,
        tolerance: q.tolerance,
      });
    } catch {
      // Unverifiable arithmetic: drop the question.
    }
  });
  return out;
}

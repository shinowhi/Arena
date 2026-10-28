import { z } from "zod";
import { chatJson, MetaLLMError } from "../llm/meta";
import { isValidSkill, skillName } from "../graph/skills";
import { verifyAnswer } from "../verify/math-verifier";

const CheckSpecSchema = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);

export const BossQuestion = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  hint: z.string(),
  check: CheckSpecSchema,
});
export type BossQuestion = z.infer<typeof BossQuestion>;

export const BossOutput = z.object({ questions: z.array(BossQuestion).length(5) });
export type BossOutput = z.infer<typeof BossOutput>;

const SYSTEM = `You write 5 isomorphic Calculus practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill. Every question MUST have a numeric answer a machine can recompute: definite integral, limit, derivative at a point, or direct numeric evaluation.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 1.234, "tolerance": 0.001, "hint": "...", "check": {...}}]}
- Exactly one question per level 1..5.
- prompt_latex: LaTeX problem statement shown to the student.
- check: machine spec proving answer_numeric, one of:
  {"kind": "numeric", "prompt_expr": "2*3+4"} (mathjs syntax; no integrals or derivatives inside)
  {"kind": "derivative_at", "expr": "x^3+2*x", "variable": "x", "at": 2}
  {"kind": "integral_at", "expr": "2*x", "variable": "x", "from": 0, "to": 3}
  {"kind": "limit_at", "expr": "sin(x)/x", "variable": "x", "at": 0}
- expr uses mathjs syntax: x^2, sin(x), exp(x), sqrt(x). Keep expressions smooth near the probe point except for genuine limit questions.
- tolerance 0.001 unless the answer scale demands otherwise.` + "\n- Plain ASCII words only outside math: write L'Hospital's rule with no accents or backslash escapes (never H\\^opital)."

export async function generateBossQuestions(skill_tag: string): Promise<BossOutput> {
  if (!isValidSkill(skill_tag)) throw new MetaLLMError(`Invalid skill_tag: ${skill_tag}`);
  let failed: BossQuestion[] = [];
  for (let round = 0; round < 3; round++) {
    const extra =
      failed.length > 0
        ? `\nThese drafts FAILED machine verification, return a fresh set of 5 with corrected variants: ${JSON.stringify(failed)}`
        : "";
    const out = await chatJson(BossOutput, [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Skill: ${skill_tag} (${skillName(skill_tag)}).${extra}` },
    ]);
    failed = out.questions.filter((q) => !verifyAnswer(q.check, q.answer_numeric, q.tolerance));
    if (failed.length === 0) return out;
  }
  throw new MetaLLMError("Could not generate 5 verified questions after 3 rounds.");
}



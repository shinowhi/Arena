import { z } from "zod";
import { chatJson, userImageMessage, MetaLLMError } from "../llm/meta";
import { isValidSkill, skillListForPrompt } from "../graph/skills";
import { verifyAnswer } from "../verify/math-verifier";

const CheckSpecSchema = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);

export const PhotoProblem = z.object({
  problem_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  hint: z.string(),
  skill_tag: z.string().min(1),
  check: CheckSpecSchema,
});
export type PhotoProblem = z.infer<typeof PhotoProblem>;

const SYSTEM = `You look at a photo of an everyday object or scene and invent ONE Calculus practice problem inspired by what you see (a round pizza -> area/integrals, stairs -> slopes/derivatives, a bill -> sums/series).
Reply with a single JSON object only: {"problem_latex": "...", "answer_numeric": 1.234, "tolerance": 0.001, "hint": "...", "skill_tag": "<id>", "check": {...}}.
- problem_latex: LaTeX problem statement a student can solve, grounded in the photo.
- The answer MUST be numeric and machine-recomputable; prove it with check, one of:
  {"kind": "numeric", "prompt_expr": "2*3+4"} (mathjs syntax; no integrals or derivatives inside)
  {"kind": "derivative_at", "expr": "x^3+2*x", "variable": "x", "at": 2}
  {"kind": "integral_at", "expr": "2*x", "variable": "x", "from": 0, "to": 3}
  {"kind": "limit_at", "expr": "sin(x)/x", "variable": "x", "at": 0}
- expr uses mathjs syntax: x^2, sin(x), exp(x), sqrt(x). tolerance 0.001 unless the answer scale demands otherwise.
- skill_tag: exactly one skill id from the list below, closest match only. Never invent ids.
Skills:
${skillListForPrompt()}`;

export async function photoToProblem(imageDataUrl: string): Promise<PhotoProblem> {
  const out = await chatJson(PhotoProblem, [
    { role: "system", content: SYSTEM },
    userImageMessage("Invent one math problem from this photo.", imageDataUrl),
  ]);
  if (!isValidSkill(out.skill_tag)) throw new MetaLLMError(`Invalid skill_tag: ${out.skill_tag}`);
  if (!verifyAnswer(out.check, out.answer_numeric, out.tolerance)) {
    throw new MetaLLMError("Photo problem failed machine verification. Try another photo.");
  }
  return out;
}

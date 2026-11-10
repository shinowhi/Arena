import { z } from "zod";
import { chatJson } from "../llm/meta";
import { recompute } from "../verify/math-verifier";
import { CheckSpecSchema } from "./boss-generator";

// Essay grading (Day 2): photo-or-text free response → transcription + rubric
// steps with per-step points. Numeric claims the model makes machine-checkable
// are recomputed: a "correct" verdict that fails arithmetic is forced to wrong.
// The model grades prose; mathjs audits numbers. Never the reverse.

export const EssayStep = z.object({
  label: z.string().min(1).max(120),
  verdict: z.enum(["correct", "partial", "wrong"]),
  points_earned: z.number().min(0),
  points_max: z.number().positive(),
  feedback: z.string().min(1).max(500),
  numeric_value: z.number().nullable().optional(),
  tolerance: z.number().positive().nullable().optional(),
  check: CheckSpecSchema.nullable().optional(),
});
export type EssayStep = z.infer<typeof EssayStep>;

export const EssayGrade = z.object({
  transcription: z.string().min(1).max(4000),
  steps: z.array(EssayStep).min(1).max(12),
});
export type EssayGrade = z.infer<typeof EssayGrade>;

export type GradedEssay = {
  transcription: string;
  steps: EssayStep[];
  total: number;
  max: number;
  flags: string[];
};

const SYSTEM = `You grade a Vietnamese student's free-response math/physics solution. Reply JSON only:
{"transcription": "<faithful text of the work>", "steps": [{"label": "...", "verdict": "correct|partial|wrong", "points_earned": 0.5, "points_max": 1, "feedback": "...", "numeric_value": 12.5, "tolerance": 0.02, "check": {...}}]}
- Split the solution into 2-8 checkable steps (setup, formula, computation, conclusion). points_max per step 0.25-2.
- feedback: 1 sentence, names the exact error or confirms the step. Match the student's language.
- For EVERY numeric step give numeric_value + tolerance + check (mathjs: {"kind":"numeric","prompt_expr":"..."}, derivative_at, integral_at, limit_at). A machine recomputes it — if your check is wrong, the step fails automatically.
- Pure reasoning steps: numeric_value/tolerance/check null.
- points_earned <= points_max always. Be strict but fair.`;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function auditSteps(raw: z.infer<typeof EssayGrade>): GradedEssay {
  const flags: string[] = [];
  const steps = raw.steps.map((s, i) => {
    let { verdict, points_earned } = s;
    const earned = Math.min(round2(points_earned), s.points_max);
    if (earned !== round2(points_earned)) flags.push(`Step ${i + 1}: earned clamped to max.`);
    points_earned = earned;
    if (verdict === "wrong" && points_earned !== 0) {
      points_earned = 0;
      flags.push(`Step ${i + 1}: wrong verdict pays zero.`);
    }
    let feedback = s.feedback;
    if (s.numeric_value !== null && s.numeric_value !== undefined && s.check) {
      const tol = s.tolerance ?? 0.01;
      try {
        const truth = recompute(s.check);
        if (Math.abs(truth - s.numeric_value) > tol && verdict !== "wrong") {
          verdict = "wrong";
          points_earned = 0;
          feedback += ` [Machine audit: recomputes to ${round2(truth)}, not ${s.numeric_value}.]`;
          flags.push(`Step ${i + 1}: verdict overruled by recompute.`);
        }
      } catch {
        flags.push(`Step ${i + 1}: check unverifiable, kept model verdict.`);
      }
    } else if ((s.numeric_value ?? null) !== null || s.check) {
      flags.push(`Step ${i + 1}: numeric step missing value or check, kept model verdict.`);
    }
    return { ...s, verdict, points_earned, feedback };
  });
  const total = round2(steps.reduce((a, s) => a + s.points_earned, 0));
  const max = round2(steps.reduce((a, s) => a + s.points_max, 0));
  return { transcription: raw.transcription, steps, total, max, flags };
}

export async function gradeEssay(input: { imageUrl?: string; text?: string }): Promise<GradedEssay> {
  const userParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  if (input.text?.trim()) userParts.push({ type: "text", text: `Solution text:\n${input.text.trim().slice(0, 4000)}` });
  if (input.imageUrl) userParts.push({ type: "image_url", image_url: { url: input.imageUrl } });
  if (userParts.length === 0) throw new Error("Nothing to grade.");
  const out = await chatJson(
    EssayGrade,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: userParts },
    ],
    { maxTokens: 8000, temperature: 0.2 },
  );
  return auditSteps(out);
}

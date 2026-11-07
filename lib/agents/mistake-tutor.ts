import { z } from "zod";
import { chatJson } from "../llm/meta";
import { skillName } from "../graph/skills";

export const MistakeNudge = z.object({ nudge: z.string().min(1).max(800) });
export type MistakeNudge = z.infer<typeof MistakeNudge>;

// True when the text contains a number equal to the answer (within
// tolerance): the model leaked the answer it was told to withhold.
export function containsAnswer(text: string, answer: number, tolerance: number): boolean {
  if (typeof text !== "string" || !Number.isFinite(answer)) return false;
  const tol = Math.max(tolerance, 1e-9);
  const tokens = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return tokens.some((t) => Math.abs(Number(t) - answer) <= tol);
}

const FALLBACK =
  "That doesn't match. Recheck signs, arithmetic, and unit conversions step by step, then try again.";

const SYSTEM = `You are a strict math tutor. The student answered a practice question wrong. Explain the LIKELY mistake (sign error, arithmetic slip, wrong formula step, unit conversion) in 1-2 short sentences and give a qualitative nudge toward the fix.
HARD RULE: NEVER state, spell out, or bracket the correct numeric answer. No digits that equal it, no ranges containing it.
Reply JSON only: {"nudge": "..."}`;

const STRICT = `You are a strict math tutor. The student answered a practice question wrong. Describe ONLY the kind of mistake in words (sign, arithmetic, formula choice, units). Do NOT write any number that could be the answer or near it.
Reply JSON only: {"nudge": "..."}`;

export type MistakeInput = {
  skill_tag: string;
  prompt_latex: string;
  answer: number;
  tolerance: number;
  wrong: number;
};

export async function explainMistake(input: MistakeInput): Promise<string> {
  const user =
    `Skill: ${input.skill_tag} (${skillName(input.skill_tag)}). ` +
    `Question: ${input.prompt_latex} ` +
    `Correct answer (NEVER REPEAT): ${input.answer}. ` +
    `Student answered: ${input.wrong}.`;
  for (const system of [SYSTEM, STRICT]) {
    try {
      const out = await chatJson(MistakeNudge, [
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      if (!containsAnswer(out.nudge, input.answer, input.tolerance)) return out.nudge;
    } catch {
      // Schema/transport failure: the strict retry or fallback covers it.
    }
  }
  return FALLBACK;
}

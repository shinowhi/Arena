import { z } from "zod";
import { chatJson, MetaLLMError } from "../llm/meta";
import { isValidSkill, isValidRootCause, skillListForPrompt } from "../graph/skills";
import type { DecomposeOutput } from "./vision-decomposer";

export const GapOutput = z.object({
  weak_skill: z.string().min(1),
  root_cause: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type GapOutput = z.infer<typeof GapOutput>;

function buildPrompt(decomp: DecomposeOutput): string {
  const lines = decomp.items.map(
    (it, i) => `${i + 1}. ${it.cau_hoi} -- student: ${it.dap_an_sinh_vien || "?"} -- tags: ${it.skill_tag.join(", ")}`,
  );
  return `Problems:\n${lines.join("\n")}\n\nSkills:\n${skillListForPrompt()}\n\nPick the weakest skill (weak_skill) and its prerequisite root cause (root_cause). Reply JSON only: {"weak_skill": "...", "root_cause": "...", "confidence": 0-1}. Both ids must come from the skill list; root_cause should be a prerequisite of weak_skill, or equal when there is no deeper cause.`;
}

export async function findGap(decomp: DecomposeOutput): Promise<GapOutput> {
  const tagged = decomp.items.filter((it) => it.skill_tag.length > 0);
  const out = await chatJson(GapOutput, [
    { role: "system", content: "You diagnose the weakest math skill from decomposed problems. Reply with a single JSON object only." },
    { role: "user", content: buildPrompt({ items: tagged }) },
  ]);
  if (!isValidSkill(out.weak_skill)) throw new MetaLLMError(`Invalid weak_skill: ${out.weak_skill}`);
  const root =
    isValidSkill(out.root_cause) && isValidRootCause(out.root_cause, out.weak_skill)
      ? out.root_cause
      : out.weak_skill; // repair: fall back to weak_skill when the model picks a bad root
  return { ...out, root_cause: root };
}

// Root-cause explainer: tells the student WHY the diagnosed root feeds the
// weak skill, with concrete fix steps. Concept-level only — never touches
// answers, so it is safe to show inline under the verdict.
import { z } from "zod";
import { chatJson, MetaLLMError } from "../llm/meta";
import { isValidRootCause, isValidSkill, prereqChain, skillDescription, skillName } from "../graph/skills";

export const ExplainOutput = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(20).max(800),
  fix_steps: z.array(z.string().min(1).max(200)).min(2).max(4),
});
export type ExplainOutput = z.infer<typeof ExplainOutput>;

export async function explainRoot(weak_skill: string, root_cause: string): Promise<ExplainOutput> {
  if (!isValidSkill(weak_skill) || !isValidSkill(root_cause)) {
    throw new MetaLLMError("Unknown skill id.");
  }
  if (!isValidRootCause(root_cause, weak_skill)) {
    throw new MetaLLMError("Not a valid root cause for this skill.");
  }
  const chain = prereqChain(weak_skill, root_cause) ?? [weak_skill, root_cause];
  const chainText = chain.map((id) => `${skillName(id)} (${id})`).join(" <- ");
  return chatJson(ExplainOutput, [
    {
      role: "system",
      content:
        'You are a patient math tutor. Reply with a single JSON object only: {"title": "...", "body": "...", "fix_steps": ["...", "...", "..."]}. Explain in 2-3 plain sentences how the root skill feeds the weak skill, then 2-4 concrete fix steps (what to review, what to drill). Plain words a 17-year-old understands. Never include test answers.',
    },
    {
      role: "user",
      content: `Weak skill: ${skillName(weak_skill)} — ${skillDescription(weak_skill)}\nRoot cause: ${skillName(root_cause)} — ${skillDescription(root_cause)}\nPrerequisite chain: ${chainText}`,
    },
  ]);
}

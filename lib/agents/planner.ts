// Study planner: turns real scan history into a concrete 7-day patch plan.
// Early days rebuild root causes, later days attack weak skills, day 7 is a
// boss-rush review. Invalid skill ids are repaired to the most frequent weak.
import { z } from "zod";
import { chatJson } from "../llm/meta";
import { isValidSkill } from "../graph/skills";

export const PlanDay = z.object({
  day: z.number().int().min(1).max(7),
  focus_skill: z.string().min(1),
  tasks: z.array(z.string().min(1)).min(1).max(4),
  minutes: z.number().int().min(5).max(120),
});
export const PlanOutput = z.object({ days: z.array(PlanDay).length(7) });
export type PlanOutput = z.infer<typeof PlanOutput>;

export type ScanSummary = {
  weak_skill: string;
  root_cause: string;
  confidence: number;
  created_at: string;
};

export async function buildPlan(history: ScanSummary[]): Promise<PlanOutput> {
  const valid = history.filter((h) => isValidSkill(h.weak_skill));
  if (valid.length === 0) throw new Error("No scan history to plan from.");
  const lines = valid
    .slice(0, 20)
    .map((h) => `- ${h.weak_skill} (root ${h.root_cause}, conf ${h.confidence}) @ ${h.created_at}`);
  const out = await chatJson(PlanOutput, [
    {
      role: "system",
      content:
        'You are a math coach. Reply with a single JSON object only: {"days": [{"day": 1, "focus_skill": "<skill id>", "tasks": ["..."], "minutes": 25}]}. Exactly 7 days. focus_skill must be a skill id from the history or its root. Tasks are concrete study actions (review X, drill Y, fight the boss), plain words, no answers.',
    },
    {
      role: "user",
      content: `Weak-skill history (newest last):\n${lines.join("\n")}\n\nWrite the 7-day patch plan: earliest days rebuild root causes, later days attack weak skills, day 7 is a boss-rush review.`,
    },
  ]);
  const freq = new Map<string, number>();
  for (const h of valid) freq.set(h.weak_skill, (freq.get(h.weak_skill) ?? 0) + 1);
  const fallback = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return {
    days: out.days.map((d) => ({
      ...d,
      focus_skill: isValidSkill(d.focus_skill) ? d.focus_skill : fallback,
    })),
  };
}

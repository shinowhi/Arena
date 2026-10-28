import { z } from "zod";
import { chatJson, userImageMessage, MetaLLMError } from "../llm/meta";
import { isValidSkill, skillListForPrompt } from "../graph/skills";

export const DecomposedItem = z.object({
  cau_hoi: z.string().min(1),
  dap_an_sinh_vien: z.string(),
  skill_tag: z.array(z.string()),
});
export type DecomposedItem = z.infer<typeof DecomposedItem>;

export const DecomposeOutput = z.object({ items: z.array(DecomposedItem).min(1) });
export type DecomposeOutput = z.infer<typeof DecomposeOutput>;

const SYSTEM = `You read a photo of Calculus 1 / Grade-12 math homework or an exam and split it into problems.
Reply with a single JSON object only: {"items": [{"cau_hoi": "...", "dap_an_sinh_vien": "...", "skill_tag": ["id1"]}]}.
- cau_hoi: the problem statement, LaTeX when it contains math.
- dap_an_sinh_vien: the student written answer, "" when not visible.
- skill_tag: 1-2 skill ids from the list below, closest match only. Never invent ids.
Skills:
${skillListForPrompt()}`;

export async function decomposeImage(imageDataUrl: string): Promise<DecomposeOutput> {
  const out = await chatJson(DecomposeOutput, [
    { role: "system", content: SYSTEM },
    userImageMessage("Split this photo into problems.", imageDataUrl),
  ]);
  const items = out.items.map((it) => ({ ...it, skill_tag: it.skill_tag.filter(isValidSkill) }));
  if (items.every((it) => it.skill_tag.length === 0)) {
    throw new MetaLLMError("Model returned no valid skill tags.");
  }
  return { items };
}

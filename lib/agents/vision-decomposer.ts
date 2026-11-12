import { z } from "zod";
import { chatJson, userImageMessage, MetaLLMError } from "../llm/meta";
import { isValidSkill, skillListForPrompt } from "../graph/skills";
import { SUBJECT_LABEL } from "../profile/types";
import type { SubjectId as Subject } from "../profile/types";

export const DecomposedItem = z.object({
  cau_hoi: z.string().min(1),
  dap_an_sinh_vien: z.string(),
  skill_tag: z.array(z.string()),
});
export type DecomposedItem = z.infer<typeof DecomposedItem>;

export const DecomposeOutput = z.object({ items: z.array(DecomposedItem).min(1) });
export type DecomposeOutput = z.infer<typeof DecomposeOutput>;

export type DecomposeOpts = { subject?: Subject };

const MATH_SYSTEM = `You read a photo of math homework (grades 6-12, Calculus 1, or Mechanics of Materials: beam and free-body diagrams, cross-sections, stress/strain calculations), or an exam, and split it into problems.
Reply with a single JSON object only: {"items": [{"cau_hoi": "...", "dap_an_sinh_vien": "...", "skill_tag": ["id1"]}]}.
- cau_hoi: the problem statement, LaTeX when it contains math.
- dap_an_sinh_vien: the student written answer, "" when not visible.
- skill_tag: 1-2 skill ids from the list below, closest match only. Never invent ids.
Skills:
${skillListForPrompt()}`;

function buildSystem(subject: Subject): string {
  if (subject === "toan") return MATH_SYSTEM;
  return `You read a photo of ${SUBJECT_LABEL[subject]} homework or an exam, and split it into problems.
Reply with a single JSON object only: {"items": [{"cau_hoi": "...", "dap_an_sinh_vien": "...", "skill_tag": ["id1"]}]}.
- cau_hoi: the problem statement, LaTeX when it contains math.
- dap_an_sinh_vien: the student written answer, "" when not visible.
- skill_tag: 1-2 skill ids from the list below, closest match only. Never invent ids. (Skill ids are math-oriented for now; per-subject graphs ship later.)
Skills:
${skillListForPrompt()}`;
}

export async function decomposeImage(imageDataUrl: string, opts?: DecomposeOpts): Promise<DecomposeOutput> {
  const subject = opts?.subject ?? "toan";
  const out = await chatJson(DecomposeOutput, [
    { role: "system", content: buildSystem(subject) },
    userImageMessage("Split this photo into problems.", imageDataUrl),
  ]);
  const items = out.items.map((it) => ({ ...it, skill_tag: it.skill_tag.filter(isValidSkill) }));
  if (items.every((it) => it.skill_tag.length === 0)) {
    throw new MetaLLMError("Model returned no valid skill tags.");
  }
  return { items };
}
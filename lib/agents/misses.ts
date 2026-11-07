import { z } from "zod";
import { CheckSpecSchema } from "./boss-generator";
import { skillName } from "../graph/skills";

// Miss Queue: re-drill the exact questions the player missed. Items carry the
// gradeable check spec but never the answer (grading reuses /api/paper/grade).

export const MissItem = z.object({
  boss_id: z.string().min(1),
  question_index: z.number().int().min(0),
  skill_tag: z.string().min(1),
  skill_name: z.string().min(1),
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  hint: z.string(),
  check: CheckSpecSchema,
  tolerance: z.number().positive(),
  missed_at: z.string().min(1),
});
export type MissItem = z.infer<typeof MissItem>;

type WrongRow = {
  boss_id: string;
  question_index: number;
  created_at: string;
  skill_tag: string;
  questions: Array<{
    level?: number;
    prompt_latex?: string;
    hint?: string;
    tolerance?: number;
    check?: unknown;
  }>;
};

// Latest miss per (boss, question) wins; malformed rows are skipped.
export function toMissItems(rows: WrongRow[]): MissItem[] {
  const seen = new Set<string>();
  const out: MissItem[] = [];
  for (const r of rows) {
    const key = `${r.boss_id}:${r.question_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const q = Array.isArray(r.questions) ? r.questions[r.question_index] : undefined;
    const parsed = MissItem.safeParse({
      boss_id: r.boss_id,
      question_index: r.question_index,
      skill_tag: r.skill_tag,
      skill_name: skillName(r.skill_tag),
      level: q?.level,
      prompt_latex: q?.prompt_latex,
      hint: q?.hint ?? "",
      check: q?.check,
      tolerance: q?.tolerance,
      missed_at: r.created_at,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

import { z } from "zod";
import { chatJson, MetaLLMError } from "../llm/meta.ts";
import type { ExamQuestion as SharedExamQuestion } from "./exam";
import { isValidSkill, skillGradeLabel, skillName, skillSubject } from "../graph/skills.ts";
import {
  checkEnglishDraft,
  crossVoteMatches,
  missingReferencedPassage,
  normalizeOption,
} from "../verify/english-verifier.ts";
import { ENGLISH_EXAM_CROSS_SYSTEM, ENGLISH_EXAM_SYSTEM, ENGLISH_SYSTEM } from "./english-prompts.ts";

// THPT English (Tieng Anh 10-12) generators. All LLM calls go through
// lib/llm/meta.ts with zod validation. English answers are option picks,
// not numbers, so verification is rule checks (4 distinct options, valid
// key, no banned patterns, reading skills carry a passage) plus an
// independent cross-answer vote on the exam path. Answers never reach the
// client: boss/drill routes strip keys, exam routes strip keys via
// assembleExam, and explanations stay server-side for review only.

// Runtime imports use explicit .ts extensions (and type-only imports for
// shared contracts) so plain node can import this module for offline
// tests: the repo's extensionless style does not resolve under node.
// English questions are multiple-choice, so they intentionally do NOT
// mirror the numeric BossQuestion contract; the exam forge returns the
// shared ExamQuestion shape (tier "draft", no numeric check) instead.

export const EnglishDraftQ = z.object({
  prompt_latex: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  answer_index: z.number().int().min(0).max(3),
  passage: z.string().optional(),
  explanation: z.string().min(1),
});

export const EnglishBossQuestion = EnglishDraftQ.extend({
  level: z.number().int().min(1).max(5),
  hint: z.string(),
});

export const EnglishBossOutput = z.object({ questions: z.array(EnglishBossQuestion).length(5) });

type EnglishBossQuestionShape = z.infer<typeof EnglishBossQuestion>;

function batchReasons(skillTag: string, questions: EnglishBossQuestionShape[]): string[][] {
  const stems = questions.map((q) => q.prompt_latex);
  return questions.map((q, i) => {
    const siblings = stems.filter((_, j) => j !== i);
    return checkEnglishDraft(q, skillTag, siblings);
  });
}

export async function generateEnglishBossQuestions(skill_tag: string): Promise<z.infer<typeof EnglishBossOutput>> {
  if (!isValidSkill(skill_tag)) throw new MetaLLMError(`Invalid skill_tag: ${skill_tag}`);
  if (skillSubject(skill_tag) !== "english") throw new MetaLLMError(`Not an english skill: ${skill_tag}`);
  let failed: EnglishBossQuestionShape[] = [];
  for (let round = 0; round < 3; round++) {
    const extra =
      failed.length > 0
        ? `\nThese drafts FAILED rule verification, return a fresh set of 5 with corrected variants: ${JSON.stringify(failed)}`
        : "";
    const out = await chatJson(
      EnglishBossOutput,
      [
        { role: "system", content: ENGLISH_SYSTEM },
        {
          role: "user",
          content: `Skill: ${skill_tag} (${skillName(skill_tag)}). Grade: ${skillGradeLabel(skill_tag)}.${extra}`,
        },
      ],
      { maxTokens: 8000, temperature: 0.7 },
    );
    const reasons = batchReasons(skill_tag, out.questions);
    failed = out.questions.filter((_, i) => reasons[i].length > 0);
    if (failed.length === 0) return out;
  }
  throw new MetaLLMError("Could not generate 5 rule-verified english questions after 3 rounds.");
}

// Draft-tier multiple-choice forge for a future THPT English paper:
// rule-checked source questions + independent cross-answer votes,
// reshuffled. Mirrors the draft path in subject-forge.ts.
const EXAM_BATCH = 5;

const EnglishSourceBatch = z.object({ questions: z.array(EnglishDraftQ).length(EXAM_BATCH) });
const EnglishCrossBatch = z.object({ answers: z.array(z.number().int().min(0).max(3)).min(1).max(EXAM_BATCH) });

function shuffled<T>(arr: T[]): { order: number[]; values: T[] } {
  const order = arr.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, values: order.map((k) => arr[k]) };
}

// Pure: one cross-vote ballot item. The passage MUST ride along: without it
// the independent voter guesses blind on cloze/reading questions and the
// cross-check is theater.
export function crossVoteItem(stem: string, passage: string | undefined, values: string[], i: number): string {
  return `Q${i}: ${stem}${passage ? `\nPassage: ${passage}` : ""}\n${values.map((o, k) => `${k}. ${o}`).join("\n")}`;
}

export async function forgeEnglishExamBatch(subject: string, avoid: string[]): Promise<SharedExamQuestion[]> {
  const gen = await chatJson(
    EnglishSourceBatch,
    [
      { role: "system", content: ENGLISH_EXAM_SYSTEM },
      { role: "user", content: `Subject: ${subject}. Avoid these stems: ${(avoid.slice(-20).join(" || ") || "none")}.` },
    ],
    { maxTokens: 8000, temperature: 0.7 },
  );
  // Rule checks FIRST: dup options, bad keys, banned patterns, and dup
  // stems die here, not later. Reading passages ride along untouched.
  const seen = new Set(avoid.map((s) => normalizeOption(s)));
  const good = gen.questions.filter((q) => {
    if (seen.has(normalizeOption(q.prompt_latex))) return false;
    if (checkEnglishDraft(q, "", []).length > 0) return false;
    if (missingReferencedPassage(q.prompt_latex, q.passage)) return false;
    seen.add(normalizeOption(q.prompt_latex));
    return true;
  });
  if (good.length === 0) return [];
  // Independent cross-answer: shuffled options, no key shown.
  const perms = good.map((q) => shuffled(q.options));
  const cross = await chatJson(
    EnglishCrossBatch,
    [
      { role: "system", content: ENGLISH_EXAM_CROSS_SYSTEM },
      {
        role: "user",
        content: perms.map((p, i) => crossVoteItem(good[i].prompt_latex, good[i].passage, p.values, i)).join("\n\n"),
      },
    ],
    { maxTokens: 4000, temperature: 0 },
  );
  const out: SharedExamQuestion[] = [];
  good.forEach((q, i) => {
    const voted = cross.answers[i];
    if (voted === undefined) return;
    // Map the vote back through the shuffle: must equal the forged key.
    if (!crossVoteMatches(perms[i].order, q.answer_index, voted)) return;
    const { order, values } = shuffled(q.options);
    out.push({
      prompt_latex: q.passage ? `${q.prompt_latex}\n\nPassage: ${q.passage}` : q.prompt_latex,
      options: values,
      answer_index: order.indexOf(q.answer_index),
      tier: "draft",
    });
  });
  return out;
}

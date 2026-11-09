import { z } from "zod";
import { chatJson } from "../llm/meta";
import { recompute } from "../verify/math-verifier";
import { CheckSpecSchema } from "./boss-generator";
import type { ExamQuestion } from "./exam";

// Slow-but-careful exam forge. Papers regenerate every 2 days (NOT per user),
// so each question earns its place through independent checks:
// - Math: machine recompute (mathjs) + distractor arithmetic checks.
// - Other subjects: 3 layers — schema, independent cross-answer, rule checks.
// Rejects retry up to 3 times, then land in `rejected` for the log. The prime
// script only upserts FULL sets, so a short forge never breaks a live paper.

const GEN_BATCH = 6;
const MATH_BATCH = 5;
const MAX_ATTEMPTS = 3;

const DraftQ = z.object({
  prompt_latex: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  answer_index: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
});
const DraftBatch = z.object({ questions: z.array(DraftQ).min(1).max(GEN_BATCH) });
const CrossBatch = z.object({ answers: z.array(z.number().int().min(0).max(3)).min(1).max(GEN_BATCH) });

const MathQ = z.object({
  prompt_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  check: CheckSpecSchema,
});
const MathBatch = z.object({ questions: z.array(MathQ).length(MATH_BATCH) });
const DistractorSet = z.object({ correct: z.string().min(1), distractors: z.array(z.string().min(1)).length(3) });
const DistractorBatch = z.object({ sets: z.array(DistractorSet).length(MATH_BATCH) });

export type SubjectSpec = {
  sectionId: string;
  tier: "verified" | "draft";
  count: number;
  // Topic line injected into the forge prompt.
  subject: string;
  avoid?: string[];
};

function norm(s: string): string {
  return s.replace(/\$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function numOpt(s: string): number | null {
  const n = Number(s.replace(/\$/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function shuffled<T>(arr: T[]): { order: number[]; values: T[] } {
  const order = arr.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, values: order.map((k) => arr[k]) };
}

const MATH_SYSTEM = `You write Vietnamese university-entrance math multiple-choice SOURCE questions (grades 10-12: algebra, geometry, trig, combinatorics, probability, basic calculus). Reply JSON only.
{"questions": [{"prompt_latex": "...", "answer_numeric": 1.5, "tolerance": 0.002, "check": {...}}]}
- Exactly ${MATH_BATCH} questions, varied topics, exam difficulty mix (2 easy, 2 medium, 1 hard).
- prompt_latex: full problem statement. The answer is ALWAYS one raw number.
- check: machine spec proving answer_numeric: {"kind":"numeric","prompt_expr":"..."} (mathjs, one expression), {"kind":"derivative_at","expr":...,"variable":"x","at":...}, {"kind":"integral_at",...,"from":..,"to":..}, or {"kind":"limit_at",...}.
- tolerance: 0.1% of magnitude, at least 0.001. Plain ASCII words outside math.`;

const DISTRACTOR_SYSTEM = `For each given math question you write ONE correct option text (the number) plus 3 WRONG-but-plausible numeric distractors (common mistakes: sign flip, off-by-factor, wrong formula). Reply JSON only.
{"sets": [{"correct": "1.5", "distractors": ["-1.5", "3", "0.5"]}]}
- Options are RAW NUMBERS only (no units, no expressions, no LaTeX).
- Every distractor must differ from the correct value by real arithmetic, never by rounding dust.`;

const DRAFT_SYSTEM = `You write exam multiple-choice questions for ONE subject (given in the user message). Reply JSON only.
{"questions": [{"prompt_latex": "...", "options": ["...", "...", "...", "..."], "answer_index": 0, "explanation": "..."}]}
- Exactly ONE correct option. Distractors plausible, clearly wrong to an expert.
- No "all of the above", no trick wording, no ambiguity between options.
- prompt_latex may use $...$ for math/chemistry formulas only.
- explanation: 1-2 sentences proving the answer (never shown to students).`;

const CROSS_SYSTEM = `Answer each multiple-choice question with the option NUMBER only (0-3). Reply JSON only: {"answers": [0, 2]}. No explanation.`;

async function forgeMathBatch(subject: string, avoid: string[]): Promise<ExamQuestion[]> {
  const gen = await chatJson(
    MathBatch,
    [
      { role: "system", content: MATH_SYSTEM },
      { role: "user", content: `Subject: ${subject}. Avoid these stems: ${(avoid.slice(-20).join(" || ") || "none")}.` },
    ],
    { maxTokens: 8000, temperature: 0.7 },
  );
  // Machine recompute FIRST: a wrong answer_numeric dies here, not later.
  const good = gen.questions.filter((q) => {
    try {
      return Math.abs(recompute(q.check) - q.answer_numeric) <= q.tolerance;
    } catch {
      return false;
    }
  });
  if (good.length === 0) return [];
  const dis = await chatJson(
    DistractorBatch.extend({ sets: z.array(DistractorSet).min(1).max(MATH_BATCH) }),
    [
      { role: "system", content: DISTRACTOR_SYSTEM },
      {
        role: "user",
        content: good.map((q, i) => `Q${i}: ${q.prompt_latex} (answer ${q.answer_numeric})`).join("\n"),
      },
    ],
    { maxTokens: 8000, temperature: 0.7 },
  );
  const out: ExamQuestion[] = [];
  good.forEach((q, i) => {
    const set = dis.sets[i];
    if (!set) return;
    try {
      const truth = recompute(q.check);
      const c = numOpt(set.correct);
      if (c === null || Math.abs(c - truth) > q.tolerance) return;
      const ds = set.distractors.map(numOpt);
      if (ds.some((d) => d === null)) return;
      const vals = ds as number[];
      // Distractors must be truly wrong AND pairwise distinct.
      if (vals.some((d) => Math.abs(d - truth) <= q.tolerance)) return;
      if (vals.some((d) => Math.abs(d - (c as number)) <= q.tolerance)) return;
      for (let a = 0; a < vals.length; a++) {
        for (let b = a + 1; b < vals.length; b++) {
          if (Math.abs(vals[a] - vals[b]) <= q.tolerance) return;
        }
      }
      const { order, values } = shuffled([set.correct, ...set.distractors]);
      out.push({
        prompt_latex: q.prompt_latex,
        options: values,
        answer_index: order.indexOf(0),
        tier: "verified",
        check: q.check,
        tolerance: q.tolerance,
      });
    } catch {
      // Unverifiable arithmetic: drop the question.
    }
  });
  return out;
}

async function forgeDraftBatch(subject: string, n: number, avoid: string[]): Promise<{ kept: ExamQuestion[]; notes: string[] }> {
  const notes: string[] = [];
  const gen = await chatJson(
    DraftBatch,
    [
      { role: "system", content: DRAFT_SYSTEM },
      {
        role: "user",
        content: `Subject: ${subject}. Write ${n} questions, varied subtopics. Avoid these stems: ${(avoid.slice(-20).join(" || ") || "none")}.`,
      },
    ],
    { maxTokens: 8000, temperature: 0.7 },
  );
  // Layer 3a (rules): 4 distinct options, sane index, unique stems.
  const cands = gen.questions.filter((q, i) => {
    const opts = q.options.map(norm);
    if (new Set(opts).size !== 4) {
      notes.push(`Q${i} dup options`);
      return false;
    }
    if (q.answer_index < 0 || q.answer_index > 3) {
      notes.push(`Q${i} bad index`);
      return false;
    }
    if (avoid.some((s) => norm(s) === norm(q.prompt_latex))) {
      notes.push(`Q${i} dup stem`);
      return false;
    }
    return true;
  });
  if (cands.length === 0) return { kept: [], notes };
  // Layer 2 (independent cross-answer): shuffled options, no key shown.
  const perms = cands.map((q) => shuffled(q.options));
  const cross = await chatJson(
    CrossBatch,
    [
      { role: "system", content: CROSS_SYSTEM },
      {
        role: "user",
        content: perms.map((p, i) => `Q${i}: ${cands[i].prompt_latex}\n${p.values.map((o, k) => `${k}. ${o}`).join("\n")}`).join("\n\n"),
      },
    ],
    { maxTokens: 4000, temperature: 0 },
  );
  const kept: ExamQuestion[] = [];
  cands.forEach((q, i) => {
    const voted = cross.answers[i];
    if (voted === undefined) {
      notes.push(`Q${i} no cross vote`);
      return;
    }
    // Map the vote back through the shuffle: must equal the forged key.
    if (perms[i].order[voted] !== q.answer_index) {
      notes.push(`Q${i} cross mismatch`);
      return;
    }
    const { order, values } = shuffled(q.options);
    kept.push({
      prompt_latex: q.prompt_latex,
      options: values,
      answer_index: order.indexOf(q.answer_index),
      tier: "draft",
    });
  });
  return { kept, notes };
}

export async function forgeSection(spec: SubjectSpec): Promise<{ questions: ExamQuestion[]; rejected: string[] }> {
  const questions: ExamQuestion[] = [];
  const rejected: string[] = [];
  const stems: string[] = [...(spec.avoid ?? [])];
  let guard = 0;
  while (questions.length < spec.count && guard < spec.count * MAX_ATTEMPTS + 4) {
    guard += 1;
    const need = spec.count - questions.length;
    try {
      if (spec.tier === "verified") {
        const got = await forgeMathBatch(spec.subject, stems);
        if (got.length === 0) rejected.push(`math batch empty (need ${need})`);
        for (const q of got.slice(0, need)) {
          questions.push(q);
          stems.push(q.prompt_latex);
        }
      } else {
        const { kept, notes } = await forgeDraftBatch(spec.subject, Math.min(GEN_BATCH, need), stems);
        rejected.push(...notes);
        for (const q of kept.slice(0, need)) {
          questions.push(q);
          stems.push(q.prompt_latex);
        }
      }
    } catch (e) {
      rejected.push(`batch error: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
  }
  return { questions: questions.slice(0, spec.count), rejected };
}

export const SECTION_SUBJECTS: Record<string, { tier: "verified" | "draft"; count: number; subject: string }> = {
  vact_vietnamese: { tier: "draft", count: 30, subject: "Vietnamese language (doc hieu, tu vung, ngu phap, chinh ta). Write statements in Vietnamese." },
  vact_english: { tier: "draft", count: 30, subject: "English reading, vocabulary and grammar for Vietnamese students. Write statements in English." },
  vact_math: { tier: "verified", count: 30, subject: "High-school mathematics" },
  vact_logic: { tier: "draft", count: 12, subject: "Logic puzzles and data interpretation (charts, tables, ratios). Prefer questions with ONE defensible answer." },
  vact_scireason: { tier: "draft", count: 18, subject: "General science reasoning (Physics, Chemistry, Biology concepts and everyday phenomena)." },
  hsa_math: { tier: "verified", count: 50, subject: "High-school mathematics and data processing" },
  hsa_literature: { tier: "draft", count: 50, subject: "Vietnamese literature and language (doc hieu van ban, kien thuc van hoc, tieng Viet). Write statements in Vietnamese." },
  hsa_science: { tier: "draft", count: 50, subject: "Natural sciences mix (Physics, Chemistry, Biology), concept and light-computation questions." },
  hsa_english: { tier: "draft", count: 50, subject: "English reading, vocabulary and grammar for Vietnamese students. Write statements in English." },
};

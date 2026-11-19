// Verifies THPT English (Tieng Anh 10-12) multiple-choice questions with
// deterministic rule checks. English answers are option picks, not numbers,
// so there is no mathjs recompute: the verifier enforces question shape
// (exactly one defensible key, 4 distinct options, valid index, no banned
// patterns, reading skills carry a passage) and the forge adds an
// independent cross-answer vote before a draft-tier question ships.
// Pure and dependency-free on purpose: safe to import from offline tests.

// Question kind per English skill. Kinds live in the prompt only; this
// registry documents the wanted-kind contract the generator prompts enforce.
export type EnglishKind = "grammar" | "vocabulary" | "reading";

export const ENGLISH_SKILL_KINDS: Record<string, EnglishKind> = {
  eng_tenses: "grammar",
  eng_articles_determiners: "grammar",
  eng_comparisons: "grammar",
  eng_modal_verbs: "grammar",
  eng_perfect_future: "grammar",
  eng_passive_voice: "grammar",
  eng_conditionals: "grammar",
  eng_reported_speech: "grammar",
  eng_relative_clauses: "grammar",
  eng_error_identification: "grammar",
  eng_sentence_transformation: "grammar",
  eng_word_formation: "vocabulary",
  eng_phrasal_verbs: "vocabulary",
  eng_collocations: "vocabulary",
  eng_synonyms_antonyms: "vocabulary",
  eng_idioms: "vocabulary",
  eng_pronunciation: "vocabulary",
  eng_word_stress: "vocabulary",
  eng_cloze_test: "reading",
  eng_reading_comprehension: "reading",
};

export function expectedKind(skillTag: string): EnglishKind | null {
  return ENGLISH_SKILL_KINDS[skillTag] ?? null;
}

// Reading skills test a passage, so every question must carry one.
export const ENGLISH_READING_SKILLS: readonly string[] = ["eng_cloze_test", "eng_reading_comprehension"];

// A passage shorter than this cannot hold a real gap or question.
export const ENGLISH_MIN_PASSAGE_CHARS = 40;

export function requiresPassage(skillTag: string): boolean {
  return ENGLISH_READING_SKILLS.includes(skillTag);
}

export function normalizeOption(s: string): string {
  return s.replace(/\$/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// True for exactly 4 non-empty, pairwise-distinct options (after
// normalization, so case/whitespace-only variants count as duplicates).
export function validOptions(options: unknown): boolean {
  if (!Array.isArray(options) || options.length !== 4) return false;
  const norms: string[] = [];
  for (const o of options) {
    if (typeof o !== "string") return false;
    const n = normalizeOption(o);
    if (n.length === 0) return false;
    norms.push(n);
  }
  return new Set(norms).size === 4;
}

export function validAnswerIndex(i: unknown): boolean {
  return typeof i === "number" && Number.isInteger(i) && i >= 0 && i <= 3;
}

// True when the stem is non-empty and not already used (case-insensitive).
export function distinctStem(stem: unknown, avoid: readonly string[]): boolean {
  if (typeof stem !== "string" || normalizeOption(stem).length === 0) return false;
  const n = normalizeOption(stem);
  return !avoid.some((s) => typeof s === "string" && normalizeOption(s) === n);
}

// Ambiguous-option patterns that make a key indefensible.
const BANNED_PATTERNS: readonly RegExp[] = [
  /all of the above/i,
  /none of the above/i,
  /both .* are correct/i,
  /all are correct/i,
  /tat ca (cac )?dap an/i,
];

// Strips Vietnamese diacritics so banned patterns match accented text too
// ("tất cả các đáp án" folds to "tat ca cac dap an").
export function stripDiacritics(s: string): string {
  return s
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function hasBannedPattern(stem: string, options: readonly string[]): boolean {
  const hay = `${stem}\n${options.join("\n")}`;
  return BANNED_PATTERNS.some((re) => re.test(hay) || re.test(stripDiacritics(hay)));
}

export type EnglishDraftShape = {
  prompt_latex: string;
  options: string[];
  answer_index: number;
  passage?: string;
};

// Rule-check one drafted question. Returns rejection reasons; empty means
// the question ships. Throws nothing.
export function checkEnglishDraft(
  q: EnglishDraftShape,
  skillTag: string,
  avoid: readonly string[] = [],
): string[] {
  try {
    const reasons: string[] = [];
    if (!distinctStem(q.prompt_latex, avoid)) reasons.push("dup or empty stem");
    if (!validOptions(q.options)) reasons.push("options not 4 distinct");
    if (!validAnswerIndex(q.answer_index)) reasons.push("bad answer_index");
    if (
      typeof q.prompt_latex === "string" &&
      Array.isArray(q.options) &&
      q.options.every((o) => typeof o === "string") &&
      hasBannedPattern(q.prompt_latex, q.options)
    ) {
      reasons.push("banned option pattern");
    }
    if (requiresPassage(skillTag)) {
      const p = typeof q.passage === "string" ? q.passage.trim() : "";
      if (p.length < ENGLISH_MIN_PASSAGE_CHARS) reasons.push("reading skill needs a passage");
    }
    return reasons;
  } catch {
    return ["uncheckable draft"];
  }
}

// True when the draft passes every rule check. Throws nothing.
export function verifyEnglishDraft(
  q: EnglishDraftShape,
  skillTag: string,
  avoid: readonly string[] = [],
): boolean {
  return checkEnglishDraft(q, skillTag, avoid).length === 0;
}

// Cross-answer agreement: `order` is the shuffle permutation applied to the
// forged options, `forged` the forged key, `voted` the independent vote on
// the shuffled options. True only when the vote maps back to the forged key.
export function crossVoteMatches(order: readonly number[], forged: number, voted: number): boolean {
  if (!validAnswerIndex(forged) || !validAnswerIndex(voted)) return false;
  if (!Array.isArray(order) || order.length !== 4) return false;
  if (new Set(order).size !== 4 || order.some((o) => !validAnswerIndex(o))) return false;
  return order[voted] === forged;
}

// Exam batches are mixed-topic (no skill tag), so skill-based passage
// rules cannot apply there. This heuristic catches the same failure:
// a stem pointing at a passage that was never supplied.
const PASSAGE_HINTS: readonly RegExp[] = [
  /passage/i,
  /đoạn văn/i,
  /doan van/i,
  /text below/i,
  /read the (passage|text)/i,
];

export function missingReferencedPassage(stem: string, passage?: string): boolean {
  if (typeof stem !== "string") return false;
  if (typeof passage === "string" && passage.trim().length >= ENGLISH_MIN_PASSAGE_CHARS) return false;
  return PASSAGE_HINTS.some((re) => re.test(stem));
}

// Drill/exam grading of one option pick: blanks (null) are always wrong,
// never coerced to an option. Throws nothing.
export function gradeEnglishMCQ(expected: number, given: number | null): boolean {
  if (given === null || !validAnswerIndex(given)) return false;
  if (!validAnswerIndex(expected)) return false;
  return given === expected;
}

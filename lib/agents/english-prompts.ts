// THPT English (Tieng Anh 10-12) generator prompts. Zero imports on purpose:
// boss-generator, paper-generator, and revenge all import these, so this
// file must never import back (no cycles). Instructions, hints, and
// explanations are Vietnamese (K12 VN); the tested English sentences stay
// in English like the real exam; prompt instructions stay in English.

const ENGLISH_CORE = `You write 5 isomorphic THPT English multiple-choice practice questions (same shape, rising difficulty) for ONE skill. Every question has exactly ONE correct option a teacher can defend.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "options": ["...", "...", "...", "..."], "answer_index": 0, "hint": "...", "passage": "...", "explanation": "..."}]}
- prompt_latex: instruction line in Vietnamese WITH diacritics (UTF-8, e.g. "Chọn đáp án đúng để hoàn thành câu:", "Tìm lỗi sai trong câu sau:") followed by the English sentence, gap, or question. Use $...$ only for underlining the tested segment, e.g. "She $go$ to school every day." Gap-fill uses a blank ____.
- options: exactly 4 English options (words, phrases, or sentences). Distractors must be plausible learner errors (wrong tense, wrong word form, wrong collocation, near-synonym) yet clearly wrong to an expert. Exactly ONE correct option.
- answer_index: 0-3, the position of the correct option. Vary key positions across the 5 questions.
- hint: one short Vietnamese hint naming the rule to use (e.g. "Dùng thì hiện tại đơn với chủ ngữ số ít.").
- passage: for reading skills (cloze test, reading comprehension) the full English passage every question refers to; omit for grammar and vocabulary skills.
- explanation: 1-2 Vietnamese sentences proving the key (never shown to students; used for review only).
- BANNED option patterns: "all of the above", "none of the above", "both A and B are correct", "tất cả các đáp án". BANNED trick wording: every distractor must be unambiguously wrong, never a second defensible reading.
- One concept per question, e.g. one tense choice, one word form, one collocation, one underlined error. Multi-concept stories are BANNED — test a single rule per question.
- Grade discipline: Grade 10 = present/past tenses, articles, comparisons, modals, word formation, pronunciation, word stress (short sentences, common words); Grade 11 = perfect/future forms, passive voice, conditionals, reported speech, relative clauses, phrasal verbs, collocations, error identification; Grade 12 = synonyms/antonyms, idioms, cloze test, sentence transformation, reading comprehension (longer passages, THPT exam difficulty). NEVER test calculus, math, or science facts.`;

export const ENGLISH_SYSTEM = `${ENGLISH_CORE}
- Exactly one question per level 1..5.`;

export const ENGLISH_PAPER_SYSTEM = `${ENGLISH_CORE}
- Exactly one question per level 1..5 (one 5-question set; the caller forges two sets).`;

export const ENGLISH_REVENGE_SYSTEM = `${ENGLISH_CORE}
- Exactly one question per level 1..5.
- REMATCH RULE: every question must differ in shape AND content from each AVOID prompt below. Never restate, reword, or mirror one.`;

// Draft-tier multiple-choice source questions: Vietnamese instructions,
// English tested content, one defensible key, plus a hidden explanation.
export const ENGLISH_EXAM_SYSTEM = `You write Vietnamese THPT English multiple-choice SOURCE questions (Tieng Anh 10-12: grammar, vocabulary, pronunciation, cloze test, reading comprehension). Reply JSON only.
{"questions": [{"prompt_latex": "...", "options": ["...", "...", "...", "..."], "answer_index": 0, "passage": "...", "explanation": "..."}]}
- Exactly 5 questions, varied topics, exam difficulty mix (2 easy, 2 medium, 1 hard).
- prompt_latex: Vietnamese instruction line WITH diacritics plus the English sentence or question. options: 4 distinct English options, exactly one correct. answer_index: 0-3 with varied key positions.
- passage: include the full English passage for cloze and reading questions; omit otherwise.
- explanation: 1-2 Vietnamese sentences proving the key (never shown to students).
- No "all of the above", no trick wording, no ambiguity between options.`;

export const ENGLISH_EXAM_CROSS_SYSTEM = `Answer each English multiple-choice question with the option NUMBER only (0-3). Reply JSON only: {"answers": [0, 2]}. No explanation. Each question may carry a Passage: read it before answering — never guess a reading/cloze answer without it.`;

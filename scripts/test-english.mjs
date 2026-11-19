// Offline tests: THPT English subject (Tieng Anh 10-12). No network, no LLM.
// Run from the repo PARENT dir: node arena/scripts/test-english.mjs
// Uses REAL imports of the english modules plus the shared graph, boss
// schemas, and mock engine (Node 24 strips types natively).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkEnglishDraft,
  crossVoteMatches,
  distinctStem,
  ENGLISH_MIN_PASSAGE_CHARS,
  ENGLISH_READING_SKILLS,
  expectedKind,
  gradeEnglishMCQ,
  hasBannedPattern,
  missingReferencedPassage,
  normalizeOption,
  requiresPassage,
  validAnswerIndex,
  validOptions,
  verifyEnglishDraft,
} from "../lib/verify/english-verifier.ts";
import {
  ENGLISH_EXAM_CROSS_SYSTEM,
  ENGLISH_EXAM_SYSTEM,
  ENGLISH_PAPER_SYSTEM,
  ENGLISH_REVENGE_SYSTEM,
  ENGLISH_SYSTEM,
} from "../lib/agents/english-prompts.ts";
import {
  crossVoteItem,
  EnglishBossOutput,
  forgeEnglishExamBatch,
  generateEnglishBossQuestions,
} from "../lib/agents/english-generator.ts";
import {
  isValidSkill,
  prereqChain,
  skillGrade,
  skillName,
  skillSubject,
  SKILL_IDS,
} from "../lib/graph/skills.ts";
import { buildMock } from "../lib/agents/thpt.ts";
import {
  buildEnglishMock,
  ENGLISH_EXAM_MINUTES,
  ENGLISH_EXAM_SPEC,
  ENGLISH_MOCK_CONFIG,
  ENGLISH_MOCK_COUNT,
  poolEnglishSkills,
  stripEnglishMockQ,
} from "../lib/english/mock.ts";
import {
  clampEnglishCount,
  EnglishDrillPaper,
  interleaveEnglishDrills,
  stripEnglishDrill,
} from "../lib/english/drill.ts";

const ARENA = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ARENA, "lib/graph/skill-graph.json"), "utf8"));

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// ---- Skill graph: 20 english nodes, valid edges, grades 10-12 ----
const eng = graph.skills.filter((s) => s.subject === "english");
ok(eng.length === 20, `english node count is 20 (got ${eng.length})`);
ok(new Set(graph.skills.map((s) => s.id)).size === graph.skills.length, "skill ids unique");
const byId = new Map(graph.skills.map((s) => [s.id, s]));
for (const s of eng) {
  ok(s.id.startsWith("eng_"), `${s.id} uses eng_ prefix`);
  ok(s.grade >= 10 && s.grade <= 12, `${s.id} grade 10-12`);
  ok(typeof s.name === "string" && s.name.length > 0, `${s.id} has a name`);
  for (const p of s.prereqs) ok(byId.has(p), `${s.id} prereq ${p} exists`);
  ok(isValidSkill(s.id), `${s.id} valid via real skills.ts`);
  ok(skillSubject(s.id) === "english", `${s.id} subject is english via real skillSubject`);
  ok(SKILL_IDS.includes(s.id), `${s.id} listed in SKILL_IDS`);
}
// Prereq chains resolve through real graph helpers.
ok(prereqChain("eng_sentence_transformation", "eng_tenses") !== null, "transformation chain reaches tenses");
ok(prereqChain("eng_reading_comprehension", "eng_word_formation") !== null, "comprehension chain reaches word formation");
ok(prereqChain("eng_word_stress", "eng_pronunciation") !== null, "stress chain reaches pronunciation");
ok(skillGrade("eng_tenses") === 10 && skillName("eng_tenses") === "Present and past tenses", "grade/name lookups");
// Other subjects untouched.
ok(skillSubject("limit_laws") === "calculus", "calculus subject intact");
ok(skillSubject("axial_loading") === "mechanics", "mechanics subject intact");
ok(skillSubject("k6_fractions") === "k12", "k12 subject intact");
ok(skillSubject("phy_kinematics") === "physics", "physics subject intact");
ok(skillSubject("che_atomic_structure") === "chemistry", "chemistry subject intact");

// ---- Verifier: deterministic MCQ rule checks, no mathjs ----
ok(validOptions(["goes", "go", "going", "gone"]) === true, "4 distinct options pass");
ok(validOptions(["goes", "go", "going"]) === false, "3 options rejected");
ok(validOptions(["goes", "Goes", "go", "going"]) === false, "case-only variants count as dupes");
ok(validOptions(["goes", "  ", "go", "going"]) === false, "blank option rejected");
ok(validOptions(["goes", "go", "going", 42]) === false, "non-string option rejected");
ok(validOptions("goes") === false, "non-array rejected");
ok(validAnswerIndex(0) && validAnswerIndex(3), "boundary indices pass");
ok(!validAnswerIndex(4) && !validAnswerIndex(-1), "out-of-range indices rejected");
ok(!validAnswerIndex(1.5) && !validAnswerIndex("0"), "non-integer indices rejected");
ok(distinctStem("Chọn đáp án đúng: She ____ here.", []) === true, "fresh stem passes");
ok(distinctStem("Chọn đáp án đúng: She ____ here.", ["chọn đáp án đúng: she ____ here."]) === false, "dup stem rejected case-insensitively");
ok(distinctStem("", []) === false, "empty stem rejected");
ok(distinctStem(42, []) === false, "non-string stem rejected");
ok(hasBannedPattern("Pick one.", ["a", "b", "c", "all of the above"]) === true, "all-of-the-above banned");
ok(hasBannedPattern("Pick one.", ["a", "b", "c", "none of the above"]) === true, "none-of-the-above banned");
ok(hasBannedPattern("Pick one.", ["a", "b", "both A and B are correct", "d"]) === true, "both-correct banned");
ok(hasBannedPattern("Chọn đáp án đúng.", ["đi", "đến", "tất cả các đáp án", "về"]) === true, "vietnamese all-answers banned");
ok(hasBannedPattern("Pick one.", ["goes", "go", "going", "gone"]) === false, "clean options pass");
ok(normalizeOption("  Goes $x$  ") === "goes x", "normalization strips latex and case");
ok(requiresPassage("eng_cloze_test") === true, "cloze requires a passage");
ok(requiresPassage("eng_reading_comprehension") === true, "comprehension requires a passage");
ok(requiresPassage("eng_tenses") === false, "grammar needs no passage");
ok(ENGLISH_READING_SKILLS.length === 2 && ENGLISH_MIN_PASSAGE_CHARS === 40, "reading registry pinned");

const cleanQ = {
  prompt_latex: "Chọn đáp án đúng để hoàn thành câu: She ____ to school every day.",
  options: ["goes", "go", "going", "gone"],
  answer_index: 0,
};
ok(checkEnglishDraft(cleanQ, "eng_tenses", []).length === 0, "clean grammar draft ships");
ok(verifyEnglishDraft(cleanQ, "eng_tenses", []) === true, "verify mirrors check on clean draft");
ok(checkEnglishDraft({ ...cleanQ, options: ["goes", "goes", "go", "going"] }, "eng_tenses", []).includes("options not 4 distinct"), "dup options flagged");
ok(checkEnglishDraft({ ...cleanQ, answer_index: 7 }, "eng_tenses", []).includes("bad answer_index"), "bad key flagged");
ok(checkEnglishDraft({ ...cleanQ, options: ["a", "b", "c", "all of the above"] }, "eng_tenses", []).includes("banned option pattern"), "banned pattern flagged");
ok(checkEnglishDraft(cleanQ, "eng_tenses", [cleanQ.prompt_latex]).includes("dup or empty stem"), "dup stem flagged");
ok(checkEnglishDraft(cleanQ, "eng_cloze_test", []).includes("reading skill needs a passage"), "cloze without passage flagged");
ok(checkEnglishDraft({ ...cleanQ, passage: "Too short." }, "eng_cloze_test", []).includes("reading skill needs a passage"), "short passage flagged");
const longPassage = "Lan gets up at six every morning. She brushes her teeth and then walks to school with her friends.";
ok(checkEnglishDraft({ ...cleanQ, passage: longPassage }, "eng_cloze_test", []).length === 0, "cloze with passage ships");
ok(verifyEnglishDraft(cleanQ, "eng_cloze_test", []) === false, "verify mirrors check on bad draft");
// Mixed-topic exam heuristic: a stem pointing at a missing passage dies.
ok(missingReferencedPassage("Đọc đoạn văn sau và trả lời câu hỏi: What is true?", undefined) === true, "hint without passage flagged");
ok(missingReferencedPassage("Đọc đoạn văn sau và trả lời câu hỏi: What is true?", longPassage) === false, "hint with passage passes");
ok(missingReferencedPassage("Read the passage and choose A, B, C or D.", "short") === true, "short passage still missing");
ok(missingReferencedPassage("Chọn đáp án đúng: She ____ here.", undefined) === false, "plain stem needs no passage");
// Cross-answer agreement maps the vote back through the shuffle.
ok(crossVoteMatches([2, 0, 3, 1], 2, 0) === true, "vote mapping back to the key passes");
ok(crossVoteMatches([2, 0, 3, 1], 2, 1) === false, "vote mapping elsewhere fails");
ok(crossVoteMatches([0, 1, 2], 0, 0) === false, "short permutation rejected");
ok(crossVoteMatches([0, 0, 2, 3], 0, 0) === false, "non-permutation rejected");
ok(crossVoteMatches([0, 1, 2, 3], 0, 9) === false, "out-of-range vote rejected");
ok(crossVoteMatches([0, 1, 2, 3], 5, 0) === false, "out-of-range key rejected");
// Kind registry covers every english skill.
ok(expectedKind("eng_tenses") === "grammar", "tenses kind is grammar");
ok(expectedKind("eng_collocations") === "vocabulary", "collocations kind is vocabulary");
ok(expectedKind("eng_cloze_test") === "reading", "cloze kind is reading");
ok(expectedKind("not_a_skill") === null, "unknown skill has no kind");
for (const s of eng) ok(expectedKind(s.id) !== null, `${s.id} has an expected kind`);
// Grading: blanks are wrong, never coerced to an option.
ok(gradeEnglishMCQ(2, 2) === true, "exact grade hit");
ok(gradeEnglishMCQ(2, 1) === false, "grade miss");
ok(gradeEnglishMCQ(0, null) === false, "null blank is wrong even at option 0");
ok(gradeEnglishMCQ(2, 5) === false, "out-of-range pick is wrong");
ok(gradeEnglishMCQ(9, 2) === false, "invalid key never grades true");

// ---- Generator prompts: Vietnamese instructions, MCQ shape, one concept ----
for (const [name, sys] of [
  ["boss", ENGLISH_SYSTEM],
  ["paper", ENGLISH_PAPER_SYSTEM],
  ["revenge", ENGLISH_REVENGE_SYSTEM],
]) {
  ok(sys.includes("options") && sys.includes("answer_index"), `${name} prompt demands MCQ shape`);
  ok(sys.includes("tiếng Việt") || sys.includes("Vietnamese"), `${name} prompt demands Vietnamese`);
  ok(sys.includes("BANNED") || sys.includes("One concept"), `${name} prompt bans multi-concept stories`);
  ok(sys.includes("Grade 10") && sys.includes("Grade 12"), `${name} prompt pins grade discipline`);
  ok(sys.includes("explanation"), `${name} prompt demands a hidden explanation`);
}
ok(ENGLISH_REVENGE_SYSTEM.includes("REMATCH RULE"), "revenge prompt has rematch rule");
ok(!ENGLISH_SYSTEM.includes("REMATCH RULE"), "boss prompt has no rematch rule");
ok(ENGLISH_EXAM_SYSTEM.includes("5 questions") || ENGLISH_EXAM_SYSTEM.includes("Exactly 5"), "exam prompt batches 5");
ok(ENGLISH_EXAM_CROSS_SYSTEM.includes('{"answers"'), "cross prompt demands bare votes");
// BossOutput schema (real import) accepts an english-shaped set.
const demoSet = {
  questions: [1, 2, 3, 4, 5].map((level) => ({
    level,
    prompt_latex: `Chọn đáp án đúng để hoàn thành câu ${level}: She ____ to school every day.`,
    options: ["goes", "go", "going", "gone"],
    answer_index: (level - 1) % 4,
    hint: "Dùng thì hiện tại đơn với chủ ngữ số ít.",
    explanation: "Chủ ngữ số ít nên động từ thêm s.",
  })),
};
ok(EnglishBossOutput.safeParse(demoSet).success, "english-shaped set parses as EnglishBossOutput");
ok(!EnglishBossOutput.safeParse({ questions: demoSet.questions.slice(0, 4) }).success, "short set rejected");
for (const q of demoSet.questions) {
  ok(verifyEnglishDraft(q, "eng_tenses", []), `demo L${q.level} verifies`);
}
// Offline generator guards reject before any network.
await assert.rejects(() => generateEnglishBossQuestions("nope_not_a_skill"), /Invalid skill_tag/);
n += 1;
await assert.rejects(() => generateEnglishBossQuestions("limit_laws"), /Not an english skill/);
n += 1;

// ---- Generator LLM wiring via stubbed transport (no real network) ----
process.env.MODEL_API_KEY = "offline-test-key";
const seenRequests = [];
let cannedQueue = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  seenRequests.push({ url, body: JSON.parse(init.body) });
  const payload = cannedQueue.shift();
  if (!payload) throw new Error("stub fetch queue empty");
  return { ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload };
};
const chatPayload = (obj) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(obj) } }] });
// Deterministic shuffle: Math.random ~1 keeps option order fixed so the
// canned cross-answer votes line up with the forged keys.
const realRandom = Math.random;
Math.random = () => 0.999999;
// Success path: 5 rule-verified questions ship after one LLM round.
cannedQueue = [chatPayload(demoSet)];
seenRequests.length = 0;
const forged = await generateEnglishBossQuestions("eng_tenses");
n += 1;
ok(forged.questions.length === 5, "stubbed forge returns 5 questions");
ok(seenRequests.length === 1, "verified drafts ship after one round");
ok(
  seenRequests[0].body.messages[0].content.includes("THPT English") &&
    seenRequests[0].body.messages[0].content.includes("answer_index"),
  "forge sends the english system prompt",
);
ok(
  seenRequests[0].body.messages[1].content.includes("eng_tenses") &&
    seenRequests[0].body.messages[1].content.includes("Grade 10"),
  "forge names the skill and grade",
);
ok(String(seenRequests[0].url).endsWith("/chat/completions"), "forge posts to chat/completions");
// Retry path: rule-breaking drafts retry, then throw after 3 rounds.
const badSet = {
  questions: demoSet.questions.map((q) => ({ ...q, options: ["goes", "goes", "go", "going"] })),
};
cannedQueue = [chatPayload(badSet), chatPayload(badSet), chatPayload(badSet)];
await assert.rejects(() => generateEnglishBossQuestions("eng_tenses"), /Could not generate 5 rule-verified/);
n += 1;
// Exam forge: source batch + agreeing cross votes become draft MC questions.
const examSources = {
  questions: [1, 2, 3, 4, 5].map((i) => ({
    prompt_latex: `Chọn đáp án đúng ${i}: They ____ football yesterday.`,
    options: ["played", "play", "playing", "plays"],
    answer_index: 0,
    explanation: "Yesterday nên dùng thì quá khứ đơn.",
  })),
};
const examVotes = { answers: [0, 0, 0, 0, 0] };
cannedQueue = [chatPayload(examSources), chatPayload(examVotes)];
const examQs = await forgeEnglishExamBatch("THPT English", []);
n += 1;
ok(examQs.length === 5, "exam forge returns 5 questions");
for (const q of examQs) {
  ok(q.options.length === 4 && new Set(q.options).size === 4, "exam options distinct");
  ok(q.tier === "draft", "exam tier draft");
  ok(!("check" in q) && !("tolerance" in q), "draft carries no numeric check");
  ok(Number.isInteger(q.answer_index) && q.answer_index >= 0 && q.answer_index <= 3, "key in range");
}
ok(
  examQs.every((q, i) => q.options[q.answer_index] === examSources.questions[i].options[0]),
  "keyed option equals the forged-correct text",
);
// Exam forge drops rule-breaking sources (dup options die first, no cross call).
const badSources = {
  questions: examSources.questions.map((q) => ({ ...q, options: ["played", "played", "play", "playing"] })),
};
cannedQueue = [chatPayload(badSources)];
seenRequests.length = 0;
const dropped = await forgeEnglishExamBatch("THPT English", []);
n += 1;
ok(dropped.length === 0, "bad sources forge nothing and skip the cross vote");
ok(seenRequests.length === 1, "bad sources stop after the source call");
// Exam forge drops cross-vote mismatches (independent answer disagrees).
cannedQueue = [chatPayload(examSources), chatPayload({ answers: [3, 3, 3, 3, 3] })];
const mismatched = await forgeEnglishExamBatch("THPT English", []);
n += 1;
ok(mismatched.length === 0, "cross mismatches forge nothing");
// Exam forge drops dup stems and passage-hint questions without passages.
const dupSources = {
  questions: [
    ...examSources.questions.slice(0, 3),
    { ...examSources.questions[0] },
    {
      prompt_latex: "Đọc đoạn văn sau và trả lời câu hỏi: What is the main idea?",
      options: ["A sunny day", "A rainy day", "A snowy day", "A windy day"],
      answer_index: 1,
      explanation: "Đoạn văn tả mưa.",
    },
  ],
};
cannedQueue = [chatPayload(dupSources), chatPayload({ answers: [0, 0, 0] })];
const deduped = await forgeEnglishExamBatch("THPT English", []);
n += 1;
ok(deduped.length === 3, "dup stem and passage-less reading question dropped");
// Reading sources WITH passages ride along into the shipped stem.
const passageSources = {
  questions: [1, 2, 3, 4, 5].map((i) => ({
    prompt_latex: `Đọc đoạn văn sau và trả lời câu hỏi ${i}: What does she do?`,
    options: ["She walks", "She runs", "She swims", "She flies"],
    answer_index: 0,
    passage: `${longPassage} Extra sentence ${i} to keep every stem unique across the batch.`,
    explanation: "Đoạn văn nói cô ấy đi bộ.",
  })),
};
cannedQueue = [chatPayload(passageSources), chatPayload({ answers: [0, 0, 0, 0, 0] })];
const passageQs = await forgeEnglishExamBatch("THPT English", []);
n += 1;
ok(passageQs.length === 5, "passage sources all ship");
ok(passageQs.every((q) => q.prompt_latex.includes("Passage:")), "passages ride along in shipped stems");
// R1: the cross-vote ballot MUST carry the passage or the voter guesses blind.
const ballot = crossVoteItem("What does she do?", "She walks to school daily.", ["walks", "runs", "swims", "flies"], 2);
ok(ballot.includes("Passage: She walks to school daily."), "cross-vote item carries the passage");
ok(ballot.includes("Q2:") && ballot.includes("0. walks") && ballot.includes("3. flies"), "cross-vote item keeps stem + numbered options");
const ballotNoPassage = crossVoteItem("He ___ home.", undefined, ["go", "goes", "going", "gone"], 0);
ok(!ballotNoPassage.includes("Passage:"), "cross-vote item omits missing passage");
ok(ENGLISH_EXAM_CROSS_SYSTEM.includes("Passage"), "cross voter is instructed to read the passage");
Math.random = realRandom;
globalThis.fetch = realFetch;

// ---- English mock wiring: 40Q / 60min over english pool ----
ok(ENGLISH_MOCK_COUNT === 40 && ENGLISH_EXAM_MINUTES === 60, "mock is 40Q/60min");
ok(
  ENGLISH_MOCK_CONFIG.skillsPerMock === 20 && ENGLISH_MOCK_CONFIG.perSkill === 2,
  "mock config 20x2",
);
ok(ENGLISH_EXAM_SPEC.count === 40 && ENGLISH_EXAM_SPEC.tier === "draft", "exam spec draft 40");
const pool = poolEnglishSkills();
ok(pool.length === 20 && pool.every((id) => skillSubject(id) === "english"), "pool holds all 20 english skills");
// R2: REAL EnglishBossBase shapes (no fake check kinds): keys + explanations
// in, stripped client-safe rows out.
const mkMockBoss = (tag, level) => ({
  level,
  prompt_latex: `Chọn đáp án đúng ${tag}-L${level}: She ___ to school.`,
  options: ["go", "goes", "going", "gone"],
  answer_index: level % 4,
  hint: "h",
  passage: level >= 4 ? `${tag} passage text about daily routine.` : undefined,
  explanation: `Vì chủ ngữ số ít nên đáp án là ${level % 4}.`,
});
const mkSet = (tag) => ({
  skill_tag: tag,
  skill_name: skillName(tag),
  questions: [1, 2, 3, 4, 5].map((level) => mkMockBoss(tag, level)),
});
const strippedMock = stripEnglishMockQ(mkMockBoss("eng_tenses", 4));
ok(!("answer_index" in strippedMock) && !("explanation" in strippedMock), "stripped mock q drops key + explanation");
ok(strippedMock.check.options === 4 && !("answer_index" in strippedMock.check), "stripped check declares shape, never the key");
ok(strippedMock.prompt_latex.includes("A. go") && strippedMock.prompt_latex.includes("D. gone"), "stripped stem embeds lettered options");
ok(strippedMock.prompt_latex.includes("Passage:"), "stripped stem carries the passage");
ok(strippedMock.tolerance === 0.001, "stripped tolerance is exact-grade 0.001");
const mock = buildEnglishMock(pool.map(mkSet), "2026-11-19");
ok(mock.length === 40, `mock assembles 40 questions (got ${mock.length})`);
ok(new Set(mock.map((q) => q.skill_tag)).size === 20, "mock rotates 20 skills");
ok(mock.every((q) => !("answer_index" in q) && !("explanation" in q)), "mock carries no answer keys");
ok(mock.every((q) => q.prompt_latex.includes("A. ")), "every mock stem embeds options");
const mockAgain = buildEnglishMock(pool.map(mkSet), "2026-11-19");
ok(
  JSON.stringify(mock.map((q) => q.prompt_latex)) === JSON.stringify(mockAgain.map((q) => q.prompt_latex)),
  "mock stable within a day",
);
const mockNext = buildEnglishMock(pool.map(mkSet), "2026-11-20");
ok(
  JSON.stringify(mock.map((q) => q.prompt_latex)) !== JSON.stringify(mockNext.map((q) => q.prompt_latex)),
  "mock rotates across days",
);
// Shared buildMock still behaves (real import sanity).
ok(buildMock([], "2026-11-19", ENGLISH_MOCK_CONFIG).length === 0, "empty sets give empty mock");

// ---- English drill wiring: interleave, clamp, strip ----
ok(clampEnglishCount(undefined) === 10, "drill count defaults to 10");
ok(clampEnglishCount(3) === 5, "drill count clamps up");
ok(clampEnglishCount(99) === 20, "drill count clamps down");
ok(clampEnglishCount(7.9) === 7, "drill count floors");
const mkBoss = (level, key) => ({
  level,
  prompt_latex: `Q-L${level}-K${key}`,
  options: ["alpha", "bravo", "charlie", "delta"],
  answer_index: key,
  hint: "h",
  explanation: "Vì đáp án này đúng ngữ pháp.",
});
const drillSets = [
  { skill_tag: "eng_tenses", questions: [5, 4, 3, 2, 1].map((l) => mkBoss(l, l % 4)) },
  { skill_tag: "eng_collocations", questions: [1, 2, 3, 4, 5].map((l) => mkBoss(l, (l + 1) % 4)) },
];
const paper = interleaveEnglishDrills(drillSets, 6);
ok(paper.length === 6, "interleave fills count");
ok(paper[0].level === 1 && paper[1].level === 1, "interleave takes level 1 of every skill first");
ok(paper[0].skill_tag === "eng_tenses" && paper[1].skill_tag === "eng_collocations", "skill order round-robins");
ok(paper[2].level === 2 && paper[4].level === 3, "interleave climbs levels round by round");
ok(EnglishDrillPaper.safeParse({ questions: paper }).success, "drill paper parses");
assert.throws(() => EnglishDrillPaper.parse({ questions: [] }), "empty drill paper rejected");
n += 1;
const stripped = stripEnglishDrill({ questions: paper });
ok(stripped.questions.length === 6, "strip keeps every question");
for (const q of stripped.questions) {
  ok(!("answer_index" in q) && !("explanation" in q), "no keys or explanations leak");
}
ok(JSON.stringify(stripped).indexOf("answer_index") === -1, "serialized drill has no keys");
ok(JSON.stringify(stripped).indexOf("explanation") === -1, "serialized drill has no explanations");
// Passages survive stripping (students need them); keys still do not.
const passagePaper = [{ ...mkBoss(1, 2), skill_tag: "eng_cloze_test", passage: longPassage }];
const strippedPassage = stripEnglishDrill(EnglishDrillPaper.parse({ questions: passagePaper }));
ok(strippedPassage.questions[0].passage === longPassage, "strip keeps the passage");
ok(!("answer_index" in strippedPassage.questions[0]), "passage question still keyless");
// Short/empty sets degrade gracefully.
ok(interleaveEnglishDrills([], 10).length === 0, "no sets give no questions");
ok(interleaveEnglishDrills([{ skill_tag: "eng_tenses", questions: [mkBoss(1, 0)] }], 5).length === 1, "short set gives what it has");

console.log(`ENGLISH TESTS OK: ${n} assertions`);

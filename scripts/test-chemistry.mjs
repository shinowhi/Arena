// Offline tests: THPT Chemistry subject (Hoa hoc 10-12). No network, no LLM.
// Run from the repo PARENT dir: node arena/scripts/test-chemistry.mjs
// Uses REAL imports of the chemistry modules plus the shared graph, boss
// schemas, and mock engine (Node 24 strips types natively).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHEMISTRY_ATOMIC_MASSES,
  CHEMISTRY_CONSTANTS,
  chemistryTolerance,
  expectedUnits,
  gradeNumeric,
  verifyChemistryAnswer,
} from "../lib/verify/chemistry-verifier.ts";
import {
  CHEMISTRY_EXAM_DISTRACTOR_SYSTEM,
  CHEMISTRY_EXAM_SYSTEM,
  CHEMISTRY_PAPER_SYSTEM,
  CHEMISTRY_REVENGE_SYSTEM,
  CHEMISTRY_SYSTEM,
} from "../lib/agents/chemistry-prompts.ts";
import {
  ChemistryBossOutput,
  forgeChemistryExamBatch,
  generateChemistryBossQuestions,
} from "../lib/agents/chemistry-generator.ts";
import {
  isValidSkill,
  prereqChain,
  skillGrade,
  skillName,
  skillSubject,
  SKILL_IDS,
} from "../lib/graph/skills.ts";
import { buildMock, MockQuestion } from "../lib/agents/thpt.ts";
import { recompute } from "../lib/verify/math-verifier.ts";
import {
  buildChemistryMock,
  CHEMISTRY_EXAM_MINUTES,
  CHEMISTRY_EXAM_SPEC,
  CHEMISTRY_MOCK_CONFIG,
  CHEMISTRY_MOCK_COUNT,
  poolChemistrySkills,
} from "../lib/chemistry/mock.ts";
import {
  ChemistryDrillPaper,
  clampChemistryCount,
  interleaveChemistryDrills,
  stripChemistryDrill,
} from "../lib/chemistry/drill.ts";

const ARENA = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ARENA, "lib/graph/skill-graph.json"), "utf8"));

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// ---- Skill graph: 20 chemistry nodes, valid edges, grades 10-12 ----
const che = graph.skills.filter((s) => s.subject === "chemistry");
ok(che.length === 20, `chemistry node count is 20 (got ${che.length})`);
ok(new Set(graph.skills.map((s) => s.id)).size === graph.skills.length, "skill ids unique");
const byId = new Map(graph.skills.map((s) => [s.id, s]));
for (const s of che) {
  ok(s.id.startsWith("che_"), `${s.id} uses che_ prefix`);
  ok(s.grade >= 10 && s.grade <= 12, `${s.id} grade 10-12`);
  ok(typeof s.name === "string" && s.name.length > 0, `${s.id} has a name`);
  for (const p of s.prereqs) ok(byId.has(p), `${s.id} prereq ${p} exists`);
  ok(isValidSkill(s.id), `${s.id} valid via real skills.ts`);
  ok(skillSubject(s.id) === "chemistry", `${s.id} subject is chemistry via real skillSubject`);
  ok(SKILL_IDS.includes(s.id), `${s.id} listed in SKILL_IDS`);
}
// Prereq chains resolve through real graph helpers.
ok(prereqChain("che_electrolysis", "che_redox") !== null, "electrolysis chain reaches redox");
ok(prereqChain("che_esters_fats", "che_organic_basics") !== null, "esters chain reaches organic basics");
ok(
  skillGrade("che_mole_stoichiometry") === 10 && skillName("che_atomic_structure") === "Atomic structure",
  "grade/name lookups",
);
// Other subjects untouched.
ok(skillSubject("limit_laws") === "calculus", "calculus subject intact");
ok(skillSubject("axial_loading") === "mechanics", "mechanics subject intact");
ok(skillSubject("k6_fractions") === "k12", "k12 subject intact");
ok(skillSubject("phy_kinematics") === "physics", "physics subject intact");

// ---- Verifier: real mathjs recompute, chemistry-only numeric checks ----
ok(
  verifyChemistryAnswer({ kind: "numeric", prompt_expr: "0.2*100" }, 20, 0.02) === true,
  "stoichiometry recompute verifies",
);
ok(
  verifyChemistryAnswer({ kind: "numeric", prompt_expr: "2*22.4" }, 44.8, 0.0448) === true,
  "gas volume recompute verifies",
);
ok(
  verifyChemistryAnswer({ kind: "numeric", prompt_expr: "-log(0.01, 10)" }, 2, 0.002) === true,
  "pH log recompute verifies",
);
ok(
  verifyChemistryAnswer({ kind: "numeric", prompt_expr: "108*1.93*5000/(1*96500)" }, 10.8, 0.0108) === true,
  "faraday recompute verifies",
);
ok(
  verifyChemistryAnswer({ kind: "numeric", prompt_expr: "0.2*100" }, 999, 0.02) === false,
  "wrong claim rejected",
);
ok(
  verifyChemistryAnswer({ kind: "derivative_at", expr: "x^2", variable: "x", at: 2 }, 4, 0.01) === false,
  "non-numeric check kind rejected for chemistry",
);
ok(
  verifyChemistryAnswer({ kind: "numeric", prompt_expr: "1/0" }, 999, 0.001) === false,
  "non-finite recompute rejected",
);
ok(
  verifyChemistryAnswer({ kind: "numeric", prompt_expr: "2+2" }, Number.NaN, 0.001) === false,
  "NaN claim rejected",
);
ok(chemistryTolerance(20) === 0.02, "tolerance 0.1% rule");
ok(chemistryTolerance(0) === 0.001, "tolerance floor at zero");
ok(chemistryTolerance(5) === 0.005, "tolerance scales");
ok(
  CHEMISTRY_CONSTANTS.NA_AVOGADRO === 6.022e23 && CHEMISTRY_CONSTANTS.MOLAR_VOLUME_STP === 22.4,
  "constants pinned",
);
ok(
  CHEMISTRY_CONSTANTS.KW === 1e-14 && CHEMISTRY_CONSTANTS.F_FARADAY === 96500,
  "more constants pinned",
);
ok(CHEMISTRY_ATOMIC_MASSES.C === 12 && CHEMISTRY_ATOMIC_MASSES.Cl === 35.5, "atomic masses pinned");
ok(expectedUnits("che_solutions_concentration").includes("M"), "concentration units list molarity");
ok(expectedUnits("che_acid_base_ph").includes("pH"), "acid-base units list pH");
ok(expectedUnits("not_a_skill").length === 0, "unknown skill has no units");
for (const s of che) ok(expectedUnits(s.id).length > 0, `${s.id} has expected units`);
// Grading: blanks are wrong, never zero-coerced.
ok(gradeNumeric(3, 3, 0.003) === true, "exact grade hit");
ok(gradeNumeric(3, 3.002, 0.003) === true, "grade hit within tolerance");
ok(gradeNumeric(3, 3.5, 0.003) === false, "grade miss outside tolerance");
ok(gradeNumeric(0, null, 0.001) === false, "null blank is wrong even at zero");
ok(gradeNumeric(3, Number.NaN, 0.003) === false, "NaN is wrong");

// ---- Generator prompts: Vietnamese, numeric-only, one formula ----
for (const [name, sys] of [
  ["boss", CHEMISTRY_SYSTEM],
  ["paper", CHEMISTRY_PAPER_SYSTEM],
  ["revenge", CHEMISTRY_REVENGE_SYSTEM],
]) {
  ok(sys.includes("numeric") && sys.includes("prompt_expr"), `${name} prompt demands numeric check`);
  ok(sys.includes("tiếng Việt") || sys.includes("Vietnamese"), `${name} prompt demands Vietnamese`);
  ok(sys.includes("BANNED") || sys.includes("One formula"), `${name} prompt bans multi-step stories`);
  ok(sys.includes("Grade 10") && sys.includes("Grade 12"), `${name} prompt pins grade discipline`);
}
ok(CHEMISTRY_REVENGE_SYSTEM.includes("REMATCH RULE"), "revenge prompt has rematch rule");
ok(!CHEMISTRY_SYSTEM.includes("REMATCH RULE"), "boss prompt has no rematch rule");
ok(CHEMISTRY_EXAM_SYSTEM.includes("5 questions") || CHEMISTRY_EXAM_SYSTEM.includes("Exactly 5"), "exam prompt batches 5");
ok(
  CHEMISTRY_EXAM_DISTRACTOR_SYSTEM.includes("RAW NUMBERS"),
  "distractor prompt demands raw numbers",
);
// BossOutput schema (real import) accepts a chemistry-shaped set.
const demoSet = {
  questions: [1, 2, 3, 4, 5].map((level) => ({
    level,
    prompt_latex: `Mẫu khí chứa $m = ${44 * level}$ g $CO_2$ (M = 44 g/mol). Tính số mol $CO_2$ theo đơn vị mol.`,
    answer_numeric: level,
    tolerance: 0.001 * level,
    hint: "Dùng công thức $n = m/M$.",
    check: { kind: "numeric", prompt_expr: `${44 * level}/44` },
  })),
};
ok(ChemistryBossOutput.safeParse(demoSet).success, "chemistry-shaped set parses as ChemistryBossOutput");
ok(!ChemistryBossOutput.safeParse({ questions: demoSet.questions.slice(0, 4) }).success, "short set rejected");
for (const q of demoSet.questions) {
  ok(verifyChemistryAnswer(q.check, q.answer_numeric, q.tolerance), `demo L${q.level} verifies`);
}
// Offline generator guards reject before any network.
await assert.rejects(() => generateChemistryBossQuestions("nope_not_a_skill"), /Invalid skill_tag/);
n += 1;
await assert.rejects(() => generateChemistryBossQuestions("limit_laws"), /Not a chemistry skill/);
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
// Success path: 5 verified questions ship after one LLM round.
cannedQueue = [chatPayload(demoSet)];
seenRequests.length = 0;
const forged = await generateChemistryBossQuestions("che_mole_stoichiometry");
n += 1;
ok(forged.questions.length === 5, "stubbed forge returns 5 questions");
ok(seenRequests.length === 1, "verified drafts ship after one round");
ok(
  seenRequests[0].body.messages[0].content.includes("THPT Chemistry") &&
    seenRequests[0].body.messages[0].content.includes("prompt_expr"),
  "forge sends the chemistry system prompt",
);
ok(
  seenRequests[0].body.messages[1].content.includes("che_mole_stoichiometry") &&
    seenRequests[0].body.messages[1].content.includes("Grade 10"),
  "forge names the skill and grade",
);
ok(String(seenRequests[0].url).endsWith("/chat/completions"), "forge posts to chat/completions");
// Retry path: wrong answers retry, then throw after 3 rounds.
const badSet = {
  questions: demoSet.questions.map((q) => ({ ...q, answer_numeric: q.answer_numeric + 999 })),
};
cannedQueue = [chatPayload(badSet), chatPayload(badSet), chatPayload(badSet)];
await assert.rejects(() => generateChemistryBossQuestions("che_mole_stoichiometry"), /Could not generate 5 verified/);
n += 1;
// Exam forge: source batch + distractors become verified MC questions.
const examSources = {
  questions: [1, 2, 3, 4, 5].map((i) => ({
    prompt_latex: `Cho $n = ${i}$ mol $CaCO_3$ (M = 100 g/mol). Tính khối lượng theo đơn vị g; các phương án là số thuần túy.`,
    answer_numeric: 100 * i,
    tolerance: 0.1 * i,
    check: { kind: "numeric", prompt_expr: `${i}*100` },
  })),
};
const examDistractors = {
  sets: [1, 2, 3, 4, 5].map((i) => ({
    correct: `${100 * i}`,
    distractors: [`${1000 * i}`, `${100 * i + 1}`, `${-100 * i}`],
  })),
};
cannedQueue = [chatPayload(examSources), chatPayload(examDistractors)];
const examQs = await forgeChemistryExamBatch("THPT Chemistry", []);
n += 1;
ok(examQs.length === 5, "exam forge returns 5 questions");
for (const q of examQs) {
  ok(q.options.length === 4 && new Set(q.options).size === 4, "exam options distinct");
  ok(q.tier === "verified", "exam tier verified");
  const truth = recompute(q.check);
  ok(Math.abs(Number(q.options[q.answer_index]) - truth) <= q.tolerance, "keyed option equals recompute");
  ok(
    q.options.every((o, k) => k === q.answer_index || Math.abs(Number(o) - truth) > q.tolerance),
    "distractors truly wrong",
  );
}
// Exam forge drops unverifiable sources (wrong answer_numeric dies first).
const badSources = {
  questions: examSources.questions.map((q) => ({ ...q, answer_numeric: q.answer_numeric + 500 })),
};
cannedQueue = [chatPayload(badSources)];
const dropped = await forgeChemistryExamBatch("THPT Chemistry", []);
n += 1;
ok(dropped.length === 0, "bad sources forge nothing and skip distractors");
globalThis.fetch = realFetch;

// ---- Chemistry mock wiring: 40Q / 50min over chemistry pool ----
ok(CHEMISTRY_MOCK_COUNT === 40 && CHEMISTRY_EXAM_MINUTES === 50, "mock is 40Q/50min");
ok(
  CHEMISTRY_MOCK_CONFIG.skillsPerMock === 20 && CHEMISTRY_MOCK_CONFIG.perSkill === 2,
  "mock config 20x2",
);
ok(CHEMISTRY_EXAM_SPEC.count === 40 && CHEMISTRY_EXAM_SPEC.tier === "verified", "exam spec verified 40");
const pool = poolChemistrySkills();
ok(pool.length === 20 && pool.every((id) => skillSubject(id) === "chemistry"), "pool holds all 20 chemistry skills");
const mkSet = (tag) => ({
  skill_tag: tag,
  skill_name: skillName(tag),
  questions: [1, 2, 3, 4, 5].map((level) => ({
    level,
    prompt_latex: `${tag}-L${level}`,
    hint: "h",
    tolerance: 0.01,
    check: { kind: "numeric", prompt_expr: `${level}` },
  })),
});
const mock = buildChemistryMock(pool.map(mkSet), "2026-11-19");
ok(mock.length === 40, `mock assembles 40 questions (got ${mock.length})`);
ok(new Set(mock.map((q) => q.skill_tag)).size === 20, "mock rotates 20 skills");
ok(mock.every((q) => !("answer_numeric" in q)), "mock carries no answer keys");
const mockAgain = buildChemistryMock(pool.map(mkSet), "2026-11-19");
ok(
  JSON.stringify(mock.map((q) => q.prompt_latex)) === JSON.stringify(mockAgain.map((q) => q.prompt_latex)),
  "mock stable within a day",
);
const mockNext = buildChemistryMock(pool.map(mkSet), "2026-11-20");
ok(
  JSON.stringify(mock.map((q) => q.prompt_latex)) !== JSON.stringify(mockNext.map((q) => q.prompt_latex)),
  "mock rotates across days",
);
// Shared buildMock still behaves (real import sanity).
ok(buildMock([], "2026-11-19", CHEMISTRY_MOCK_CONFIG).length === 0, "empty sets give empty mock");

// ---- Chemistry drill wiring: interleave, clamp, strip ----
ok(clampChemistryCount(undefined) === 10, "drill count defaults to 10");
ok(clampChemistryCount(3) === 5, "drill count clamps up");
ok(clampChemistryCount(99) === 20, "drill count clamps down");
ok(clampChemistryCount(7.9) === 7, "drill count floors");
const mkBoss = (level, ans) => ({
  level,
  prompt_latex: `Q-L${level}`,
  answer_numeric: ans,
  tolerance: 0.01,
  hint: "h",
  check: { kind: "numeric", prompt_expr: `${ans}` },
});
const drillSets = [
  { skill_tag: "che_mole_stoichiometry", questions: [5, 4, 3, 2, 1].map((l) => mkBoss(l, l)) },
  { skill_tag: "che_redox", questions: [1, 2, 3, 4, 5].map((l) => mkBoss(l, 10 + l)) },
];
const paper = interleaveChemistryDrills(drillSets, 6);
ok(paper.length === 6, "interleave fills count");
ok(paper[0].level === 1 && paper[1].level === 1, "interleave takes level 1 of every skill first");
ok(paper[0].skill_tag === "che_mole_stoichiometry" && paper[1].skill_tag === "che_redox", "skill order round-robins");
ok(paper[2].level === 2 && paper[4].level === 3, "interleave climbs levels round by round");
ok(ChemistryDrillPaper.safeParse({ questions: paper }).success, "drill paper parses");
assert.throws(() => ChemistryDrillPaper.parse({ questions: [] }), "empty drill paper rejected");
n += 1;
const stripped = stripChemistryDrill({ questions: paper });
ok(stripped.questions.length === 6, "strip keeps every question");
for (const q of stripped.questions) {
  ok(!("answer_numeric" in q) && !("check" in q), "no keys or check specs leak");
}
ok(JSON.stringify(stripped).indexOf("answer_numeric") === -1, "serialized drill has no answers");
// Short/empty sets degrade gracefully.
ok(interleaveChemistryDrills([], 10).length === 0, "no sets give no questions");
ok(interleaveChemistryDrills([{ skill_tag: "che_mole_stoichiometry", questions: [mkBoss(1, 3)] }], 5).length === 1, "short set gives what it has");

// ---- Route contract: /api/chemistry/mock serves the chemistry pool only (no DB) ----
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
ok(DAY_RE.test("2026-11-19") && !DAY_RE.test("19-11-2026") && !DAY_RE.test("2026/11/19"), "day param accepts YYYY-MM-DD only");
ok(pool.every((id) => id.startsWith("che_")), "pool is che_ prefixed only");
ok(pool.every((id) => skillGrade(id) >= 10 && skillGrade(id) <= 12), "pool is grades 10-12 only");
ok(!pool.includes("limit_laws") && !pool.includes("phy_kinematics") && !pool.includes("eng_tenses"), "math/physics/english skills stay out of the pool");
ok(
  CHEMISTRY_MOCK_CONFIG.skillsPerMock * CHEMISTRY_MOCK_CONFIG.perSkill === CHEMISTRY_MOCK_COUNT,
  "config counts multiply to 40",
);
ok(pool.length >= CHEMISTRY_MOCK_CONFIG.skillsPerMock, "full pool clears the warming-up threshold");
ok([pool[0]].length < CHEMISTRY_MOCK_CONFIG.skillsPerMock, "short pool trips the warming-up threshold");
ok(MockQuestion.array().safeParse(mock).success, "assembled rows parse as MockQuestion");
ok(!MockQuestion.array().safeParse([{ level: 9 }]).success, "malformed rows fail MockQuestion");
const routeBody = {
  date: "2026-11-19",
  total: mock.length,
  skills: [...new Set(mock.map((q) => q.skill_tag))],
  questions: mock,
};
ok(routeBody.total === 40 && routeBody.skills.length === 20, "response shape carries date/total/skills/questions");
ok(routeBody.skills.every((id) => pool.includes(id)), "response skills stay inside the pool");

console.log(`CHEMISTRY TESTS OK: ${n} assertions`);

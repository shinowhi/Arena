// Offline tests: THPT Physics subject (Vat ly 10-12). No network, no LLM.
// Run from the repo PARENT dir: node arena/scripts/test-physics.mjs
// Uses REAL imports of the physics modules plus the shared graph, boss
// schemas, and mock engine (Node 24 strips types natively).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expectedUnits,
  gradeNumeric,
  PHYSICS_CONSTANTS,
  physicsTolerance,
  verifyPhysicsAnswer,
} from "../lib/verify/physics-verifier.ts";
import {
  PHYSICS_EXAM_DISTRACTOR_SYSTEM,
  PHYSICS_EXAM_SYSTEM,
  PHYSICS_PAPER_SYSTEM,
  PHYSICS_REVENGE_SYSTEM,
  PHYSICS_SYSTEM,
} from "../lib/agents/physics-prompts.ts";
import {
  forgePhysicsExamBatch,
  generatePhysicsBossQuestions,
  PhysicsBossOutput,
} from "../lib/agents/physics-generator.ts";
import {
  isValidSkill,
  prereqChain,
  skillGrade,
  skillName,
  skillSubject,
  SKILL_IDS,
} from "../lib/graph/skills.ts";
import { buildMock } from "../lib/agents/thpt.ts";
import { recompute } from "../lib/verify/math-verifier.ts";
import {
  buildPhysicsMock,
  PHYSICS_EXAM_MINUTES,
  PHYSICS_EXAM_SPEC,
  PHYSICS_MOCK_CONFIG,
  PHYSICS_MOCK_COUNT,
  poolPhysicsSkills,
} from "../lib/physics/mock.ts";
import {
  clampPhysicsCount,
  interleavePhysicsDrills,
  PhysicsDrillPaper,
  stripPhysicsDrill,
} from "../lib/physics/drill.ts";

const ARENA = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ARENA, "lib/graph/skill-graph.json"), "utf8"));

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// ---- Skill graph: 22 physics nodes, valid edges, grades 10-12 ----
const phy = graph.skills.filter((s) => s.subject === "physics");
ok(phy.length === 22, `physics node count is 22 (got ${phy.length})`);
ok(new Set(graph.skills.map((s) => s.id)).size === graph.skills.length, "skill ids unique");
const byId = new Map(graph.skills.map((s) => [s.id, s]));
for (const s of phy) {
  ok(s.id.startsWith("phy_"), `${s.id} uses phy_ prefix`);
  ok(s.grade >= 10 && s.grade <= 12, `${s.id} grade 10-12`);
  ok(typeof s.name === "string" && s.name.length > 0, `${s.id} has a name`);
  for (const p of s.prereqs) ok(byId.has(p), `${s.id} prereq ${p} exists`);
  ok(isValidSkill(s.id), `${s.id} valid via real skills.ts`);
  ok(skillSubject(s.id) === "physics", `${s.id} subject is physics via real skillSubject`);
  ok(SKILL_IDS.includes(s.id), `${s.id} listed in SKILL_IDS`);
}
// Prereq chains resolve through real graph helpers.
ok(prereqChain("phy_nuclear_reactions", "phy_em_waves") !== null, "nuclear chain reaches em waves");
ok(prereqChain("phy_ac_circuits", "phy_dc_circuits") !== null, "ac chain reaches dc");
ok(skillGrade("phy_kinematics") === 10 && skillName("phy_kinematics") === "Kinematics", "grade/name lookups");
// Other subjects untouched.
ok(skillSubject("limit_laws") === "calculus", "calculus subject intact");
ok(skillSubject("axial_loading") === "mechanics", "mechanics subject intact");
ok(skillSubject("k6_fractions") === "k12", "k12 subject intact");

// ---- Verifier: real mathjs recompute, physics-only numeric checks ----
ok(
  verifyPhysicsAnswer({ kind: "numeric", prompt_expr: "12/4" }, 3, 0.003) === true,
  "ohm law recompute verifies",
);
ok(
  verifyPhysicsAnswer({ kind: "numeric", prompt_expr: "12000/150" }, 80, 0.08) === true,
  "stress-style arithmetic verifies",
);
ok(
  verifyPhysicsAnswer({ kind: "numeric", prompt_expr: "9e9*1.6e-19*1.6e-19/(1e-10^2)" }, 2.304e-8, 2.304e-11) === true,
  "coulomb arithmetic verifies",
);
ok(
  verifyPhysicsAnswer({ kind: "numeric", prompt_expr: "12/4" }, 999, 0.003) === false,
  "wrong claim rejected",
);
ok(
  verifyPhysicsAnswer({ kind: "derivative_at", expr: "x^2", variable: "x", at: 2 }, 4, 0.01) === false,
  "non-numeric check kind rejected for physics",
);
ok(
  verifyPhysicsAnswer({ kind: "numeric", prompt_expr: "1/0" }, 999, 0.001) === false,
  "non-finite recompute rejected",
);
ok(
  verifyPhysicsAnswer({ kind: "numeric", prompt_expr: "2+2" }, Number.NaN, 0.001) === false,
  "NaN claim rejected",
);
ok(physicsTolerance(20) === 0.02, "tolerance 0.1% rule");
ok(physicsTolerance(0) === 0.001, "tolerance floor at zero");
ok(physicsTolerance(5) === 0.005, "tolerance scales");
ok(PHYSICS_CONSTANTS.G_THPT === 10 && PHYSICS_CONSTANTS.K_COULOMB === 9e9, "constants pinned");
ok(
  PHYSICS_CONSTANTS.E_CHARGE === 1.6e-19 &&
    PHYSICS_CONSTANTS.C_LIGHT === 3e8 &&
    PHYSICS_CONSTANTS.KWH_TO_J === 3.6e6,
  "more constants pinned",
);
ok(expectedUnits("phy_dc_circuits").includes("A"), "dc units list current");
ok(expectedUnits("phy_wave_optics").length > 0, "optics units listed");
ok(expectedUnits("not_a_skill").length === 0, "unknown skill has no units");
for (const s of phy) ok(expectedUnits(s.id).length > 0, `${s.id} has expected units`);
// Grading: blanks are wrong, never zero-coerced.
ok(gradeNumeric(3, 3, 0.003) === true, "exact grade hit");
ok(gradeNumeric(3, 3.002, 0.003) === true, "grade hit within tolerance");
ok(gradeNumeric(3, 3.5, 0.003) === false, "grade miss outside tolerance");
ok(gradeNumeric(0, null, 0.001) === false, "null blank is wrong even at zero");
ok(gradeNumeric(3, Number.NaN, 0.003) === false, "NaN is wrong");

// ---- Generator prompts: Vietnamese, numeric-only, one formula ----
for (const [name, sys] of [
  ["boss", PHYSICS_SYSTEM],
  ["paper", PHYSICS_PAPER_SYSTEM],
  ["revenge", PHYSICS_REVENGE_SYSTEM],
]) {
  ok(sys.includes("numeric") && sys.includes("prompt_expr"), `${name} prompt demands numeric check`);
  ok(sys.includes("tiếng Việt") || sys.includes("Vietnamese"), `${name} prompt demands Vietnamese`);
  ok(sys.includes("BANNED") || sys.includes("One formula"), `${name} prompt bans multi-step stories`);
  ok(sys.includes("Grade 10") && sys.includes("Grade 12"), `${name} prompt pins grade discipline`);
}
ok(PHYSICS_REVENGE_SYSTEM.includes("REMATCH RULE"), "revenge prompt has rematch rule");
ok(!PHYSICS_SYSTEM.includes("REMATCH RULE"), "boss prompt has no rematch rule");
ok(PHYSICS_EXAM_SYSTEM.includes("5 questions") || PHYSICS_EXAM_SYSTEM.includes("Exactly 5"), "exam prompt batches 5");
ok(
  PHYSICS_EXAM_DISTRACTOR_SYSTEM.includes("RAW NUMBERS"),
  "distractor prompt demands raw numbers",
);
// BossOutput schema (real import) accepts a physics-shaped set.
const demoSet = {
  questions: [1, 2, 3, 4, 5].map((level) => ({
    level,
    prompt_latex: `Tính cường độ dòng điện khi $U = ${12 * level}$ V qua $R = 4$ Ω theo đơn vị A.`,
    answer_numeric: 3 * level,
    tolerance: 0.003 * level,
    hint: "Dùng định luật Ôm $I = U/R$.",
    check: { kind: "numeric", prompt_expr: `${12 * level}/4` },
  })),
};
ok(PhysicsBossOutput.safeParse(demoSet).success, "physics-shaped set parses as PhysicsBossOutput");
ok(!PhysicsBossOutput.safeParse({ questions: demoSet.questions.slice(0, 4) }).success, "short set rejected");
for (const q of demoSet.questions) {
  ok(verifyPhysicsAnswer(q.check, q.answer_numeric, q.tolerance), `demo L${q.level} verifies`);
}
// Offline generator guards reject before any network.
await assert.rejects(() => generatePhysicsBossQuestions("nope_not_a_skill"), /Invalid skill_tag/);
n += 1;
await assert.rejects(() => generatePhysicsBossQuestions("limit_laws"), /Not a physics skill/);
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
const forged = await generatePhysicsBossQuestions("phy_dc_circuits");
n += 1;
ok(forged.questions.length === 5, "stubbed forge returns 5 questions");
ok(seenRequests.length === 1, "verified drafts ship after one round");
ok(
  seenRequests[0].body.messages[0].content.includes("THPT Physics") &&
    seenRequests[0].body.messages[0].content.includes("prompt_expr"),
  "forge sends the physics system prompt",
);
ok(
  seenRequests[0].body.messages[1].content.includes("phy_dc_circuits") &&
    seenRequests[0].body.messages[1].content.includes("Grade 11"),
  "forge names the skill and grade",
);
ok(String(seenRequests[0].url).endsWith("/chat/completions"), "forge posts to chat/completions");
// Retry path: wrong answers retry, then throw after 3 rounds.
const badSet = {
  questions: demoSet.questions.map((q) => ({ ...q, answer_numeric: q.answer_numeric + 999 })),
};
cannedQueue = [chatPayload(badSet), chatPayload(badSet), chatPayload(badSet)];
await assert.rejects(() => generatePhysicsBossQuestions("phy_dc_circuits"), /Could not generate 5 verified/);
n += 1;
// Exam forge: source batch + distractors become verified MC questions.
const examSources = {
  questions: [1, 2, 3, 4, 5].map((i) => ({
    prompt_latex: `Tính $I$ khi $U = ${12 * i}$ V qua $R = 4$ Ω theo đơn vị A; các phương án là số thuần túy.`,
    answer_numeric: 3 * i,
    tolerance: 0.003 * i,
    check: { kind: "numeric", prompt_expr: `${12 * i}/4` },
  })),
};
const examDistractors = {
  sets: [1, 2, 3, 4, 5].map((i) => ({
    correct: `${3 * i}`,
    distractors: [`${30 * i}`, `${3 * i + 1}`, `${-3 * i}`],
  })),
};
cannedQueue = [chatPayload(examSources), chatPayload(examDistractors)];
const examQs = await forgePhysicsExamBatch("THPT Physics", []);
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
const dropped = await forgePhysicsExamBatch("THPT Physics", []);
n += 1;
ok(dropped.length === 0, "bad sources forge nothing and skip distractors");
globalThis.fetch = realFetch;

// ---- Physics mock wiring: 40Q / 50min over physics pool ----
ok(PHYSICS_MOCK_COUNT === 40 && PHYSICS_EXAM_MINUTES === 50, "mock is 40Q/50min");
ok(
  PHYSICS_MOCK_CONFIG.skillsPerMock === 20 && PHYSICS_MOCK_CONFIG.perSkill === 2,
  "mock config 20x2",
);
ok(PHYSICS_EXAM_SPEC.count === 40 && PHYSICS_EXAM_SPEC.tier === "verified", "exam spec verified 40");
const pool = poolPhysicsSkills();
ok(pool.length === 22 && pool.every((id) => skillSubject(id) === "physics"), "pool holds all 22 physics skills");
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
const mock = buildPhysicsMock(pool.map(mkSet), "2026-11-19");
ok(mock.length === 40, `mock assembles 40 questions (got ${mock.length})`);
ok(new Set(mock.map((q) => q.skill_tag)).size === 20, "mock rotates 20 skills");
ok(mock.every((q) => !("answer_numeric" in q)), "mock carries no answer keys");
const mockAgain = buildPhysicsMock(pool.map(mkSet), "2026-11-19");
ok(
  JSON.stringify(mock.map((q) => q.prompt_latex)) === JSON.stringify(mockAgain.map((q) => q.prompt_latex)),
  "mock stable within a day",
);
const mockNext = buildPhysicsMock(pool.map(mkSet), "2026-11-20");
ok(
  JSON.stringify(mock.map((q) => q.prompt_latex)) !== JSON.stringify(mockNext.map((q) => q.prompt_latex)),
  "mock rotates across days",
);
// Shared buildMock still behaves (real import sanity).
ok(buildMock([], "2026-11-19", PHYSICS_MOCK_CONFIG).length === 0, "empty sets give empty mock");

// ---- Physics drill wiring: interleave, clamp, strip ----
ok(clampPhysicsCount(undefined) === 10, "drill count defaults to 10");
ok(clampPhysicsCount(3) === 5, "drill count clamps up");
ok(clampPhysicsCount(99) === 20, "drill count clamps down");
ok(clampPhysicsCount(7.9) === 7, "drill count floors");
const mkBoss = (level, ans) => ({
  level,
  prompt_latex: `Q-L${level}`,
  answer_numeric: ans,
  tolerance: 0.01,
  hint: "h",
  check: { kind: "numeric", prompt_expr: `${ans}` },
});
const drillSets = [
  { skill_tag: "phy_dc_circuits", questions: [5, 4, 3, 2, 1].map((l) => mkBoss(l, l)) },
  { skill_tag: "phy_newton_laws", questions: [1, 2, 3, 4, 5].map((l) => mkBoss(l, 10 + l)) },
];
const paper = interleavePhysicsDrills(drillSets, 6);
ok(paper.length === 6, "interleave fills count");
ok(paper[0].level === 1 && paper[1].level === 1, "interleave takes level 1 of every skill first");
ok(paper[0].skill_tag === "phy_dc_circuits" && paper[1].skill_tag === "phy_newton_laws", "skill order round-robins");
ok(paper[2].level === 2 && paper[4].level === 3, "interleave climbs levels round by round");
ok(PhysicsDrillPaper.safeParse({ questions: paper }).success, "drill paper parses");
assert.throws(() => PhysicsDrillPaper.parse({ questions: [] }), "empty drill paper rejected");
n += 1;
const stripped = stripPhysicsDrill({ questions: paper });
ok(stripped.questions.length === 6, "strip keeps every question");
for (const q of stripped.questions) {
  ok(!("answer_numeric" in q) && !("check" in q), "no keys or check specs leak");
}
ok(JSON.stringify(stripped).indexOf("answer_numeric") === -1, "serialized drill has no answers");
// Short/empty sets degrade gracefully.
ok(interleavePhysicsDrills([], 10).length === 0, "no sets give no questions");
ok(interleavePhysicsDrills([{ skill_tag: "phy_dc_circuits", questions: [mkBoss(1, 3)] }], 5).length === 1, "short set gives what it has");

console.log(`PHYSICS TESTS OK: ${n} assertions`);

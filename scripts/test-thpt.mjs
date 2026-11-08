// Offline tests: exam-mock builder. No network.
// Run: node arena/scripts/test-thpt.mjs
// Note: mirrors lib/agents/thpt.ts.
import assert from "node:assert/strict";

// Mirror of fnv1a in lib/agents/thpt.ts.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mirror of rotateSkills + buildMock in lib/agents/thpt.ts.
function rotateSkills(skills, dateStr, count) {
  return [...skills].sort((a, b) => fnv1a(a + dateStr) - fnv1a(b + dateStr)).slice(0, count);
}
function buildMock(sets, dateStr, config) {
  const order = rotateSkills(sets.map((s) => s.skill_tag), dateStr, config.skillsPerMock);
  const byId = new Map(sets.map((s) => [s.skill_tag, s]));
  const out = [];
  order.forEach((tag, j) => {
    const set = byId.get(tag);
    if (!set) return;
    const sorted = [...set.questions].sort((a, b) => a.level - b.level);
    const want = config.levels[j % config.levels.length].slice(0, config.perSkill);
    for (const lv of want) {
      const q = sorted[lv - 1];
      if (q) out.push({ ...q, skill_tag: set.skill_tag, skill_name: set.skill_name });
    }
  });
  return out;
}

const THPT_CONFIG = { skillsPerMock: 25, perSkill: 2, levels: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 1]] };

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Hash is deterministic and unsigned.
ok(fnv1a("k9_vieta2026-11-07") === fnv1a("k9_vieta2026-11-07"), "fnv deterministic");
ok(Number.isInteger(fnv1a("x")) && fnv1a("x") >= 0, "fnv unsigned int");
// Rotation is stable per day, capped, and varies by day.
const skills = Array.from({ length: 30 }, (_, i) => `s${i}`);
const d1a = rotateSkills(skills, "2026-11-07", 25);
const d1b = rotateSkills(skills, "2026-11-07", 25);
const d2 = rotateSkills(skills, "2026-11-08", 25);
ok(JSON.stringify(d1a) === JSON.stringify(d1b), "same day same order");
ok(d1a.length === 25 && new Set(d1a).size === 25, "capped at 25 distinct");
ok(JSON.stringify(d1a) !== JSON.stringify(d2), "different day different order");

// Mock: 25 skills x 2 = 50 questions, levels cycle.
const mkSet = (tag) => ({ skill_tag: tag, skill_name: tag, questions: [1, 2, 3, 4, 5].map((lv) => ({ level: lv, prompt_latex: `${tag}-L${lv}`, hint: "h", tolerance: 0.01, check: { kind: "numeric", prompt_expr: "1" } })) });
const sets = skills.map(mkSet);
const mock = buildMock(sets, "2026-11-07", THPT_CONFIG);
ok(mock.length === 50, "50 questions built, got " + mock.length);
ok(new Set(mock.map((q) => q.skill_tag)).size === 25, "25 distinct skills");
const lvCount = {};
for (const q of mock) lvCount[q.level] = (lvCount[q.level] ?? 0) + 1;
ok([1, 2, 3, 4, 5].every((lv) => lvCount[lv] === 10), "levels balanced 10 each: " + JSON.stringify(lvCount));
// Short pool yields a short mock (route 503s on this).
ok(buildMock(sets.slice(0, 3), "2026-11-07", THPT_CONFIG).length === 6, "short pool short mock");

console.log(`THPT TESTS OK: ${n} assertions`);

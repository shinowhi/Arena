// Offline tests: shared MC exam engine. No network.
// Run: node arena/scripts/test-exam.mjs
// Note: mirrors lib/agents/exam.ts.
import assert from "node:assert/strict";

// Mirror of epoch2 in lib/agents/exam.ts.
const DAY_MS = 86400000;
function epoch2(dateStr) {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new Error("Bad date");
  return Math.floor(ms / DAY_MS / 2);
}

// Mirror of configs in lib/agents/exam.ts.
const VACT = {
  clock: "single", totalMinutes: 150, pointsPerQ: 10, scale: 1200,
  sections: [
    { id: "vact_vietnamese", count: 30, firstNo: 1 },
    { id: "vact_english", count: 30, firstNo: 31 },
    { id: "vact_math", count: 30, firstNo: 61 },
    { id: "vact_logic", count: 12, firstNo: 91 },
    { id: "vact_scireason", count: 18, firstNo: 103 },
  ],
};
const HSA = {
  clock: "per_section", totalMinutes: 195, pointsPerQ: 1, scale: 150,
  sections: [
    { id: "hsa_math", count: 50, minutes: 75, firstNo: 1 },
    { id: "hsa_literature", count: 50, minutes: 60, firstNo: 51 },
    { id: "hsa_science", count: 50, minutes: 60, firstNo: 101, choice: "p3" },
    { id: "hsa_english", count: 50, minutes: 60, firstNo: 101, choice: "p3" },
  ],
};

function activeSections(config, p3) {
  const fixed = config.sections.filter((s) => !s.choice);
  const group = config.sections.filter((s) => s.choice);
  if (group.length === 0) return fixed;
  const pick = group.find((s) => s.id === p3) ?? null;
  return pick ? [...fixed, pick] : fixed;
}

function assembleExam(rows, config, p3) {
  const byId = new Map(rows.map((r) => [r.skill_tag, r]));
  return activeSections(config, p3).map((s) => {
    const row = byId.get(s.id);
    if (!row || !Array.isArray(row.questions) || row.questions.length < s.count) {
      throw new Error(`section ${s.id} not ready`);
    }
    return {
      id: s.id,
      as_of: row.fetched_at,
      questions: row.questions.slice(0, s.count).map((q, i) => ({
        no: s.firstNo + i,
        prompt_latex: q.prompt_latex,
        options: q.options,
        tier: q.tier,
      })),
    };
  });
}

function gradeSelection(q, selected) {
  return Number.isInteger(selected) && selected >= 0 && selected <= 3 && selected === q.answer_index;
}

// Mirror of reviewAllowed in lib/agents/exam.ts.
function reviewAllowed(startedAt, totalMinutes, now = new Date()) {
  const start = new Date(startedAt).getTime();
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(t)) return false;
  return t >= start + totalMinutes * 60_000;
}

function assembleReview(rows, config, p3) {
  const byId = new Map(rows.map((r) => [r.skill_tag, r]));
  return activeSections(config, p3).map((s) => {
    const row = byId.get(s.id);
    if (!row || !Array.isArray(row.questions) || row.questions.length < s.count) {
      throw new Error(`section ${s.id} not ready`);
    }
    return {
      id: s.id,
      questions: row.questions.slice(0, s.count).map((q, i) => ({
        no: s.firstNo + i,
        prompt_latex: q.prompt_latex,
        options: q.options,
        tier: q.tier,
        answer_index: q.answer_index,
      })),
    };
  });
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// V-ACT shape: 120Q, single 150' clock, /1200 scale.
ok(VACT.sections.reduce((a, s) => a + s.count, 0) === 120, "vact 120 questions");
ok(VACT.clock === "single" && VACT.totalMinutes === 150, "vact single 150 clock");
ok(120 * VACT.pointsPerQ === VACT.scale, "vact scale math");
// HSA shape: 150Q with p3 choice, 75+60+60 clocks, /150 scale.
ok(HSA.sections.filter((s) => !s.choice).reduce((a, s) => a + s.count, 0) === 100, "hsa fixed 100");
ok(HSA.sections.filter((s) => s.choice === "p3").length === 2, "hsa two p3 options");
ok(HSA.sections.find((s) => s.id === "hsa_math").minutes === 75, "hsa math 75min");
ok(HSA.totalMinutes === 195 && 150 * HSA.pointsPerQ === HSA.scale, "hsa 195min scale 150");
// Section choice logic.
ok(activeSections(VACT).length === 5, "vact ignores p3");
ok(activeSections(HSA).length === 2, "hsa no-p3 gives fixed only");
ok(activeSections(HSA, "hsa_science").length === 3, "hsa science picked");
ok(activeSections(HSA, "hsa_english")[2].id === "hsa_english", "hsa english picked");
ok(activeSections(HSA, "bogus").length === 2, "hsa bogus p3 falls back");
// 2-day epoch: deterministic, stable within 3-day check, moves over time.
ok(epoch2("2026-11-09") === epoch2("2026-11-09"), "epoch deterministic");
ok(epoch2("2026-11-12") !== epoch2("2026-11-09"), "epoch moves within 3 days");
ok(Number.isInteger(epoch2("2026-11-09")) && epoch2("2026-11-09") >= 0, "epoch unsigned int");
assert.throws(() => epoch2("not-a-date"), "epoch rejects bad date");
// Assembly: strips keys, numbers globally, throws when short.
const mkRow = (id, count) => ({
  skill_tag: id,
  fetched_at: "2026-11-09T00:00:00Z",
  questions: Array.from({ length: count }, (_, i) => ({
    prompt_latex: `${id}-Q${i}`,
    options: ["a", "b", "c", "d"],
    answer_index: i % 4,
    tier: "draft",
    check: { kind: "numeric", prompt_expr: "1" },
  })),
});
const vactRows = VACT.sections.map((s) => mkRow(s.id, s.count));
const asm = assembleExam(vactRows, VACT);
ok(asm.reduce((a, s) => a + s.questions.length, 0) === 120, "assembled 120");
ok(!("answer_index" in asm[0].questions[0]) && !("check" in asm[0].questions[0]), "keys stripped");
ok(asm[2].questions[0].no === 61 && asm[4].questions[17].no === 120, "global numbering");
ok(asm.every((s) => s.as_of === "2026-11-09T00:00:00Z"), "as_of pinned");
assert.throws(() => assembleExam(vactRows.slice(0, 4), VACT), "short paper throws");
// Grading: exact index match only.
ok(gradeSelection({ answer_index: 2 }, 2) === true, "grade hit");
ok(gradeSelection({ answer_index: 2 }, 1) === false, "grade miss");
ok(gradeSelection({ answer_index: 0 }, 4) === false, "grade out of range");
// Review assembly: same paper plus the key, still no check spec.
const rev = assembleReview(vactRows, VACT);
ok(rev.reduce((a, s) => a + s.questions.length, 0) === 120, "review 120");
ok(rev[0].questions[0].answer_index === 0 && rev[0].questions[3].answer_index === 3, "review keys kept");
ok(rev.every((s) => s.questions.every((q) => q.options.length === 4 && !("check" in q))), "review 4 options no check");
ok(rev[2].questions[0].no === 61, "review numbering matches mock");
assert.throws(() => assembleReview(vactRows.slice(0, 4), VACT), "review short paper throws");
// Review gate: locked mid-paper, open at/after expiry (boundary inclusive).
ok(reviewAllowed("2026-11-10T00:00:00Z", 150, "2026-11-10T02:29:59Z") === false, "review blocked mid-paper");
ok(reviewAllowed("2026-11-10T00:00:00Z", 150, "2026-11-10T02:30:00Z") === true, "review allowed exactly at expiry");
ok(reviewAllowed("2026-11-10T00:00:00Z", 150, "2026-11-10T03:00:00Z") === true, "review allowed after expiry");
ok(reviewAllowed("bogus", 150, "2026-11-10T03:00:00Z") === false, "review bad start blocked");
ok(reviewAllowed(0, 90, 90 * 60_000) === true, "review thpt 90min boundary allowed");

console.log(`EXAM TESTS OK: ${n} assertions`);

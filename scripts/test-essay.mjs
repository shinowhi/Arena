// Offline tests: essay rubric audit. No network.
// Run: node arena/scripts/test-essay.mjs
// Note: mirrors auditSteps in lib/agents/essay-grader.ts (recompute stubbed).
import assert from "node:assert/strict";

const round2 = (n) => Math.round(n * 100) / 100;
// Stub recompute: evaluates {"kind":"numeric","prompt_expr"} via Function.
function recompute(check) {
  if (check.kind !== "numeric") throw new Error("stub only");
  const v = Function(`"use strict"; return (${check.prompt_expr});`)();
  if (!Number.isFinite(v)) throw new Error("non-finite");
  return v;
}
function auditSteps(raw) {
  const flags = [];
  const steps = raw.steps.map((s, i) => {
    let { verdict, points_earned } = s;
    const earned = Math.min(round2(points_earned), s.points_max);
    if (earned !== round2(points_earned)) flags.push(`Step ${i + 1}: earned clamped to max.`);
    points_earned = earned;
    if (verdict === "wrong" && points_earned !== 0) {
      points_earned = 0;
      flags.push(`Step ${i + 1}: wrong verdict pays zero.`);
    }
    let feedback = s.feedback;
    if (s.numeric_value !== null && s.numeric_value !== undefined && s.check) {
      const tol = s.tolerance ?? 0.01;
      try {
        const truth = recompute(s.check);
        if (Math.abs(truth - s.numeric_value) > tol && verdict !== "wrong") {
          verdict = "wrong";
          points_earned = 0;
          feedback += ` [Machine audit: recomputes to ${round2(truth)}, not ${s.numeric_value}.]`;
          flags.push(`Step ${i + 1}: verdict overruled by recompute.`);
        }
      } catch {
        flags.push(`Step ${i + 1}: check unverifiable, kept model verdict.`);
      }
    } else if ((s.numeric_value ?? null) !== null || s.check) {
      flags.push(`Step ${i + 1}: numeric step missing value or check, kept model verdict.`);
    }
    return { ...s, verdict, points_earned, feedback };
  });
  const total = round2(steps.reduce((a, s) => a + s.points_earned, 0));
  const max = round2(steps.reduce((a, s) => a + s.points_max, 0));
  return { transcription: raw.transcription, steps, total, max, flags };
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const mk = (o) => ({ label: "s", verdict: "correct", points_earned: 1, points_max: 1, feedback: "ok", numeric_value: null, tolerance: null, check: null, ...o });
// Totals sum and round.
let r = auditSteps({ transcription: "t", steps: [mk({ points_earned: 0.5 }), mk({ points_earned: 0.335, points_max: 1 })] });
ok(r.total === 0.84 && r.max === 2, "totals sum rounded");
// Earned over max clamps with a flag.
r = auditSteps({ transcription: "t", steps: [mk({ points_earned: 2, points_max: 1 })] });
ok(r.steps[0].points_earned === 1 && r.flags.length === 1, "clamp with flag");
// Correct arithmetic keeps the verdict.
r = auditSteps({ transcription: "t", steps: [mk({ numeric_value: 7, tolerance: 0.01, check: { kind: "numeric", prompt_expr: "3+4" } })] });
ok(r.steps[0].verdict === "correct" && r.total === 1, "good math kept");
// Wrong arithmetic overrules to wrong + zero + flag.
r = auditSteps({ transcription: "t", steps: [mk({ numeric_value: 8, tolerance: 0.01, check: { kind: "numeric", prompt_expr: "3+4" } })] });
ok(r.steps[0].verdict === "wrong" && r.steps[0].points_earned === 0, "bad math zeroed");
ok(r.flags.some((f) => f.includes("overruled")), "overrule flagged");
ok(r.steps[0].feedback.includes("7"), "audit note names truth");
// Within tolerance passes.
r = auditSteps({ transcription: "t", steps: [mk({ numeric_value: 3.333, tolerance: 0.01, check: { kind: "numeric", prompt_expr: "10/3" } })] });
ok(r.steps[0].verdict === "correct", "tolerance respected");
// Model-wrong stays wrong even when math also disagrees (no double flag).
r = auditSteps({ transcription: "t", steps: [mk({ verdict: "wrong", points_earned: 0, numeric_value: 8, check: { kind: "numeric", prompt_expr: "3+4" } })] });
ok(r.steps[0].verdict === "wrong" && r.flags.length === 0, "wrong stays wrong silently");
// Stub covers numeric-only by design; 1/0 throws non-finite in both stub and mathjs.
r = auditSteps({ transcription: "t", steps: [mk({ numeric_value: 1, check: { kind: "numeric", prompt_expr: "1/0" } })] });
ok(r.steps[0].verdict === "correct" && r.flags.length === 1, "unverifiable flagged kept");
// Unpaired value/check flags without changing the verdict.
r = auditSteps({ transcription: "t", steps: [mk({ numeric_value: 5, check: null })] });
ok(r.steps[0].verdict === "correct" && r.flags.length === 1, "unpaired flagged");
// Model wrong with points pays zero.
r = auditSteps({ transcription: "t", steps: [mk({ verdict: "wrong", points_earned: 1 })] });
ok(r.steps[0].points_earned === 0 && r.flags.length === 1, "wrong pays zero");
// Prose steps untouched.
r = auditSteps({ transcription: "t", steps: [mk({ verdict: "partial", points_earned: 0.5, points_max: 1 })] });
ok(r.steps[0].verdict === "partial" && r.total === 0.5 && r.flags.length === 0, "prose passthrough");

console.log(`ESSAY TESTS OK: ${n} assertions`);

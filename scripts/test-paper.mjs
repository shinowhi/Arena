// Offline tests: practice-paper contract + answer stripping. No network.
// Run: node arena/scripts/test-paper.mjs
// Note: mirrors lib/agents/paper-generator.ts schemas (same convention as
// test-agent-contracts.mjs). Live generation is covered by probe + typecheck.
import assert from "node:assert/strict";
import { z } from "zod";

const CheckSpec = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);
const BossQuestion = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  hint: z.string(),
  check: CheckSpec,
});
const PaperOutput = z.object({ questions: z.array(BossQuestion).length(10) });
const StrippedQuestion = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  tolerance: z.number().positive(),
  hint: z.string(),
  check: CheckSpec,
});

// Mirror of stripPaper: keeps everything except answer_numeric.
function stripPaper(paper) {
  return {
    questions: paper.questions.map((q) => ({
      level: q.level,
      prompt_latex: q.prompt_latex,
      tolerance: q.tolerance,
      hint: q.hint,
      check: q.check,
    })),
  };
}

const mkQ = (level, answer_numeric) => ({
  level,
  prompt_latex: `Q${level}`,
  answer_numeric,
  tolerance: 0.001,
  hint: "h",
  check: { kind: "numeric", prompt_expr: `${answer_numeric}` },
});
const full = { questions: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5].map((lv, i) => mkQ(lv, i + 1)) };

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

ok(PaperOutput.safeParse(full).success, "10-question paper parses");
ok(!PaperOutput.safeParse({ questions: full.questions.slice(0, 5) }).success, "5 questions rejected (must be 10)");
ok(!PaperOutput.safeParse({ questions: full.questions.map((q) => ({ ...q, level: 9 })) }).success, "bad level rejected");

const stripped = stripPaper(full);
ok(stripped.questions.length === 10, "strip keeps 10");
for (const q of stripped.questions) {
  ok(!("answer_numeric" in q), "no answer leaks to client");
  ok(StrippedQuestion.safeParse(q).success, "stripped question keeps gradeable shape");
}
ok(stripped.questions[0].check.prompt_expr === "1", "check spec survives strip");
ok(JSON.stringify(stripped).indexOf("answer_numeric") === -1, "serialized paper has no answers");

const GradeBody = z.object({ check: CheckSpec, tolerance: z.number().positive(), answer: z.number().finite() });
ok(GradeBody.safeParse({ check: { kind: "numeric", prompt_expr: "2*3" }, tolerance: 0.001, answer: 6 }).success, "grade body parses");
ok(!GradeBody.safeParse({ check: { kind: "nope" }, tolerance: 0.001, answer: 6 }).success, "bad check rejected");
ok(!GradeBody.safeParse({ check: { kind: "numeric", prompt_expr: "2*3" }, tolerance: 0.001, answer: NaN }).success, "NaN answer rejected");

// Mirror of lib/paper/exam.ts (timed exam mode).
const EXAM_SECONDS = 900;
const examRemainingMs = (deadlineMs, nowMs) => Math.max(0, deadlineMs - nowMs);
const examExpired = (deadlineMs, nowMs) => nowMs >= deadlineMs;
function formatExamClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
ok(EXAM_SECONDS === 900, "exam is 15 minutes");
ok(formatExamClock(900000) === "15:00", "clock shows 15:00");
ok(formatExamClock(61000) === "01:01", "clock pads minutes and seconds");
ok(formatExamClock(0) === "00:00" && formatExamClock(-500) === "00:00", "clock clamps at zero");
ok(examRemainingMs(1000, 400) === 600 && examRemainingMs(1000, 1400) === 0, "remaining clamps at zero");
ok(examExpired(1000, 1000) === true && examExpired(1000, 999) === false, "expiry at deadline");

console.log(`PAPER TESTS OK: ${n} assertions`);

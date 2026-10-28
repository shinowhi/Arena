// Offline tests: math-verifier recomputation + boss schema mirror. No network.
// Run: node arena/scripts/test-boss.mjs
import assert from "node:assert/strict";
import { z } from "zod";
import { verifyAnswer, recompute } from "../lib/verify/math-verifier.ts";

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

ok(near(recompute({ kind: "numeric", prompt_expr: "2*3+4" }), 10, 1e-9), "numeric eval");
ok(near(recompute({ kind: "derivative_at", expr: "x^2", variable: "x", at: 3 }), 6, 1e-3), "d/dx x^2 at 3 = 6");
ok(near(recompute({ kind: "integral_at", expr: "2*x", variable: "x", from: 0, to: 3 }), 9, 1e-6), "integral 2x 0..3 = 9");
ok(near(recompute({ kind: "limit_at", expr: "sin(x)/x", variable: "x", at: 0 }), 1, 1e-3), "limit sin(x)/x = 1");
ok(verifyAnswer({ kind: "derivative_at", expr: "x^2", variable: "x", at: 3 }, 6.0005, 0.001), "tolerance accepts close");
ok(!verifyAnswer({ kind: "derivative_at", expr: "x^2", variable: "x", at: 3 }, 6.01, 0.001), "tolerance rejects far");
ok(!verifyAnswer({ kind: "derivative_at", expr: "sqrt(x)", variable: "x", at: 0 }, 0, 0.001), "non-finite rejected");
ok(!verifyAnswer({ kind: "numeric", prompt_expr: "2+2" }, Number.NaN, 0.001), "NaN claim rejected");

const CheckSpec = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);
const BossOutput = z.object({ questions: z.array(z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  hint: z.string(),
  check: CheckSpec,
})).length(5) });

const q = (level, check, ans) => ({ level, prompt_latex: "q" + level, answer_numeric: ans, tolerance: 0.001, hint: "h", check });
const good = { questions: [
  q(1, { kind: "numeric", prompt_expr: "1+1" }, 2),
  q(2, { kind: "derivative_at", expr: "x^2", variable: "x", at: 1 }, 2),
  q(3, { kind: "integral_at", expr: "x", variable: "x", from: 0, to: 2 }, 2),
  q(4, { kind: "limit_at", expr: "sin(x)/x", variable: "x", at: 0 }, 1),
  q(5, { kind: "numeric", prompt_expr: "3*3" }, 9),
]};
ok(BossOutput.safeParse(good).success, "boss sample accepted");
ok(!BossOutput.safeParse({ questions: good.questions.slice(0, 4) }).success, "4 questions rejected");
const missing = JSON.parse(JSON.stringify(good));
delete missing.questions[0].check;
ok(!BossOutput.safeParse(missing).success, "missing check rejected");

console.log("BOSS TESTS OK: " + n + " assertions");


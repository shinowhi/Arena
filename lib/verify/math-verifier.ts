import { evaluate } from "mathjs";

// Verifies Boss questions whose answers are NUMERIC by recomputing them with mathjs.
// Never trust the answer_numeric coming from the LLM.

// Supported check kinds (the generator must supply one per question):
// - numeric: prompt_expr evaluated directly, e.g. "2*3 + 4"
// - derivative_at: d/dx of `expr` in `variable` at x=`at`, numeric diff
// - integral_at: `expr` integrated numerically from `from` to `to` (Simpson)
// - limit_at: `expr` sampled approaching `at` from both sides
export type CheckSpec =
  | { kind: "numeric"; prompt_expr: string }
  | { kind: "derivative_at"; expr: string; variable: string; at: number }
  | { kind: "integral_at"; expr: string; variable: string; from: number; to: number }
  | { kind: "limit_at"; expr: string; variable: string; at: number };

function evalAt(expr: string, variable: string, value: number): number {
  const v = evaluate(expr, { [variable]: value });
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`non-finite value for ${expr}`);
  return n;
}

function numericDerivative(expr: string, variable: string, at: number): number {
  const h = Math.max(1e-5, Math.abs(at) * 1e-5);
  return (evalAt(expr, variable, at + h) - evalAt(expr, variable, at - h)) / (2 * h);
}

function simpson(expr: string, variable: string, from: number, to: number): number {
  const n = 1000;
  const h = (to - from) / n;
  let sum = evalAt(expr, variable, from) + evalAt(expr, variable, to);
  for (let i = 1; i < n; i++) {
    sum += evalAt(expr, variable, from + i * h) * (i % 2 === 0 ? 2 : 4);
  }
  return (sum * h) / 3;
}

function numericLimit(expr: string, variable: string, at: number): number {
  const probes = [1e-4, 1e-5, 1e-6];
  const vals = probes.flatMap((d) => [evalAt(expr, variable, at + d), evalAt(expr, variable, at - d)]);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  for (const v of vals) {
    if (Math.abs(v - avg) > 0.01 + Math.abs(avg) * 0.01) throw new Error("limit did not settle");
  }
  return avg;
}

export function recompute(check: CheckSpec): number {
  switch (check.kind) {
    case "numeric":
      return evalAt(check.prompt_expr, "__x", 0);
    case "derivative_at":
      return numericDerivative(check.expr, check.variable, check.at);
    case "integral_at":
      return simpson(check.expr, check.variable, check.from, check.to);
    case "limit_at":
      return numericLimit(check.expr, check.variable, check.at);
  }
}

// True when |recomputed - claimed| <= max(tolerance, 1e-6). Throws nothing.
export function verifyAnswer(check: CheckSpec, claimed: number, tolerance: number): boolean {
  try {
    if (!Number.isFinite(claimed)) return false;
    const got = recompute(check);
    return Math.abs(got - claimed) <= Math.max(tolerance, 1e-6);
  } catch {
    return false;
  }
}

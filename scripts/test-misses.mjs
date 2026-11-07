// Offline tests: miss-item shaping + contract. No network.
// Run: node arena/scripts/test-misses.mjs
// Note: mirrors toMissItems in lib/agents/misses.ts (shape logic only;
// skillName falls back to the id, same as the lib).
import assert from "node:assert/strict";
import { z } from "zod";

const CheckSpec = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);
const MissItem = z.object({
  boss_id: z.string().min(1),
  question_index: z.number().int().min(0),
  skill_tag: z.string().min(1),
  skill_name: z.string().min(1),
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  hint: z.string(),
  check: CheckSpec,
  tolerance: z.number().positive(),
  missed_at: z.string().min(1),
});

// Mirror of toMissItems in lib/agents/misses.ts.
function toMissItems(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = `${r.boss_id}:${r.question_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const q = Array.isArray(r.questions) ? r.questions[r.question_index] : undefined;
    const parsed = MissItem.safeParse({
      boss_id: r.boss_id,
      question_index: r.question_index,
      skill_tag: r.skill_tag,
      skill_name: r.skill_tag,
      level: q?.level,
      prompt_latex: q?.prompt_latex,
      hint: q?.hint ?? "",
      check: q?.check,
      tolerance: q?.tolerance,
      missed_at: r.created_at,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const Q = (over = {}) => ({
  level: 2,
  prompt_latex: "q?",
  hint: "h",
  answer_numeric: 80,
  tolerance: 0.08,
  check: { kind: "numeric", prompt_expr: "12000/150" },
  ...over,
});
const row = (boss, qi, questions, at = "2026-11-06T10:00:00Z") => ({ boss_id: boss, question_index: qi, created_at: at, skill_tag: "axial_loading", questions });

// Happy path shapes one item and never leaks the answer.
let items = toMissItems([row("b1", 1, [Q({ level: 1 }), Q({ level: 2 })])]);
ok(items.length === 1, "one miss shapes one item");
ok(items[0].level === 2 && items[0].skill_name === "axial_loading", "fields carried over");
ok(!("answer_numeric" in items[0]), "no answer leaks to client");
ok(JSON.stringify(items).indexOf("answer_numeric") === -1, "serialized queue has no answers");

// Latest duplicate wins (first row kept), malformed rows skipped.
items = toMissItems([
  row("b1", 0, [Q()], "2026-11-06T11:00:00Z"),
  row("b1", 0, [Q()], "2026-11-06T10:00:00Z"),
  row("b2", 5, [Q()], "2026-11-06T10:00:00Z"),
  row("b3", 0, null, "2026-11-06T10:00:00Z"),
  row("b4", 0, [{ level: 1 }], "2026-11-06T10:00:00Z"),
]);
ok(items.length === 1 && items[0].missed_at === "2026-11-06T11:00:00Z", "dedupe keeps latest, skips malformed");

// Contract.
ok(z.object({ items: z.array(MissItem) }).safeParse({ items }).success, "GET response parses");

console.log(`MISSES TESTS OK: ${n} assertions`);

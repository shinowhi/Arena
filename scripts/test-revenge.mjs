// Offline tests: revenge target vote + avoid-list + response contracts. No network.
// Run: node arena/scripts/test-revenge.mjs
// Note: mirrors lib/agents/revenge.ts pure fns (same convention as
// test-batch.mjs and test-social.mjs).
import assert from "node:assert/strict";
import { z } from "zod";

// Mirror of pickRevengeTarget in lib/agents/revenge.ts.
function pickRevengeTarget(wrongs) {
  const votes = wrongs.filter((w) => typeof w.skill_tag === "string" && w.skill_tag.length > 0);
  if (votes.length === 0) return null;
  const count = new Map();
  const latest = new Map();
  for (const w of votes) {
    count.set(w.skill_tag, (count.get(w.skill_tag) ?? 0) + 1);
    if ((latest.get(w.skill_tag) ?? "") < w.created_at) latest.set(w.skill_tag, w.created_at);
  }
  let best = "";
  let bestCount = -1;
  let bestAt = "";
  for (const [skill, n] of count) {
    const at = latest.get(skill) ?? "";
    if (n > bestCount || (n === bestCount && at > bestAt)) {
      best = skill;
      bestCount = n;
      bestAt = at;
    }
  }
  return { skill_tag: best, wrong_count: bestCount };
}

// Mirror of collectAvoidPrompts in lib/agents/revenge.ts.
function collectAvoidPrompts(bosses, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const b of bosses) {
    for (const q of b.questions ?? []) {
      const p = (q.prompt_latex ?? "").slice(0, 300);
      if (p.length === 0 || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const TargetOut = z.object({
  target: z
    .object({ skill_tag: z.string(), skill_name: z.string(), wrong_count: z.number().int().positive() })
    .nullable(),
});
const SummonOut = z.object({
  boss_id: z.string().min(1),
  skill_tag: z.string().min(1),
  wrong_count: z.number().int().positive(),
  avoided: z.number().int().min(0),
});

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Majority of misses wins.
let t = pickRevengeTarget([
  { skill_tag: "chain_rule", created_at: "2026-11-01T00:00:00Z" },
  { skill_tag: "chain_rule", created_at: "2026-11-02T00:00:00Z" },
  { skill_tag: "lhopital_rule", created_at: "2026-11-03T00:00:00Z" },
]);
ok(t.skill_tag === "chain_rule" && t.wrong_count === 2, "majority skill wins");

// Tie breaks toward the most recent miss.
t = pickRevengeTarget([
  { skill_tag: "chain_rule", created_at: "2026-11-01T00:00:00Z" },
  { skill_tag: "lhopital_rule", created_at: "2026-11-03T00:00:00Z" },
]);
ok(t.skill_tag === "lhopital_rule", "tie breaks to most recent");

// Empty and junk inputs yield no target.
ok(pickRevengeTarget([]) === null, "empty wrongs give null");
ok(pickRevengeTarget([{ skill_tag: "", created_at: "2026-11-01T00:00:00Z" }]) === null, "blank skill gives null");

// Avoid-list dedupes, skips blanks, truncates, caps.
const bosses = [
  { questions: [{ prompt_latex: "q1" }, { prompt_latex: "" }, {}, { prompt_latex: "q1" }] },
  { questions: [{ prompt_latex: "x".repeat(500) }, { prompt_latex: "q2" }] },
];
const avoid = collectAvoidPrompts(bosses);
ok(avoid.length === 3 && avoid[0] === "q1", "dedupe + skip blanks");
ok(avoid[1].length === 300, "long prompt truncated");
ok(collectAvoidPrompts(bosses, 2).length === 2, "limit caps output");
const many = [{ questions: Array.from({ length: 13 }, (_, i) => ({ prompt_latex: `pq${i}` })) }];
ok(collectAvoidPrompts(many).length === 12, "default limit caps at 12");
ok(collectAvoidPrompts([]).length === 0, "no bosses, no avoid");

// Contracts.
ok(TargetOut.safeParse({ target: { skill_tag: "chain_rule", skill_name: "Chain Rule", wrong_count: 2 } }).success, "GET target parses");
ok(TargetOut.safeParse({ target: null }).success, "GET null target parses");
ok(!TargetOut.safeParse({ target: { skill_tag: "chain_rule", skill_name: "Chain Rule", wrong_count: 0 } }).success, "zero wrongs rejected");
ok(SummonOut.safeParse({ boss_id: "uuid", skill_tag: "chain_rule", wrong_count: 2, avoided: 8 }).success, "POST summon parses");
ok(!SummonOut.safeParse({ boss_id: "uuid", skill_tag: "chain_rule", wrong_count: 2 }).success, "missing avoided rejected");

console.log(`REVENGE TESTS OK: ${n} assertions`);

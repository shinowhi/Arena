// Offline tests: root explainer contract + prereq-chain rule. No network.
// Run: node arena/scripts/test-explain.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";

const graph = JSON.parse(readFileSync("arena/lib/graph/skill-graph.json", "utf8"));
const byId = new Map(graph.skills.map((s) => [s.id, s]));
// Mirror of prereqChain in lib/graph/skills.ts.
function prereqChain(weak, root) {
  if (weak === root) return [weak];
  const prev = new Map();
  const queue = [weak];
  const seen = new Set([weak]);
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const p of (byId.get(cur) ? byId.get(cur).prereqs : [])) {
      if (seen.has(p)) continue;
      seen.add(p);
      prev.set(p, cur);
      if (p === root) {
        const chain = [root];
        let at = root;
        while (at !== weak) {
          at = prev.get(at);
          chain.unshift(at);
        }
        return chain;
      }
      queue.push(p);
    }
  }
  return null;
}

const ExplainOutput = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(20).max(800),
  fix_steps: z.array(z.string().min(1).max(200)).min(2).max(4),
});

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

ok(
  JSON.stringify(prereqChain("implicit_differentiation", "differentiation_rules")) ===
    JSON.stringify(["implicit_differentiation", "chain_rule", "differentiation_rules"]),
  "chain walks transitive prereqs",
);
ok(JSON.stringify(prereqChain("chain_rule", "chain_rule")) === JSON.stringify(["chain_rule"]), "self chain");
ok(prereqChain("chain_rule", "implicit_differentiation") === null, "uphill chain is null");
ok(prereqChain("chain_rule", "nope") === null, "unknown root is null");

const good = { title: "Why", body: "x".repeat(50), fix_steps: ["Review A", "Drill B"] };
ok(ExplainOutput.safeParse(good).success, "explanation parses");
ok(!ExplainOutput.safeParse({ ...good, body: "short" }).success, "short body rejected");
ok(!ExplainOutput.safeParse({ ...good, fix_steps: ["Only one"] }).success, "single step rejected");
ok(!ExplainOutput.safeParse({ ...good, fix_steps: ["a", "b", "c", "d", "e"] }).success, "five steps rejected");

console.log(`EXPLAIN TESTS OK: ${n} assertions`);

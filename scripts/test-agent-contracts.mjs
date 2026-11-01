// Offline contract tests: schemas + skill-graph rules. No network.
// Run: node arena/scripts/test-agent-contracts.mjs
// Note: mirrors the zod schemas in lib/agents (self-contained on purpose so it
// runs on plain node without a TS loader). Live behavior is covered by the
// photo probe + build typecheck.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";

const DecomposeOutput = z.object({ items: z.array(z.object({
  cau_hoi: z.string().min(1),
  dap_an_sinh_vien: z.string(),
  skill_tag: z.array(z.string()),
})).min(1) });
const GapOutput = z.object({
  weak_skill: z.string().min(1),
  root_cause: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const graph = JSON.parse(readFileSync("arena/lib/graph/skill-graph.json", "utf8"));
const byId = new Map(graph.skills.map((s) => [s.id, s]));
const isValidSkill = (id) => byId.has(id);
function isValidRootCause(root, weak) {
  if (root === weak) return true;
  const seen = new Set();
  const stack = [...(byId.get(weak) ? byId.get(weak).prereqs : [])];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === root) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = byId.get(cur);
    if (node) stack.push(...node.prereqs);
  }
  return false;
}

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };

ok(graph.skills.length >= 30 && graph.skills.length <= 64, "30-64 skills, got " + graph.skills.length);
for (const s of graph.skills) {
  for (const p of s.prereqs) ok(byId.has(p), "dangling prereq " + s.id + " -> " + p);
}
ok(isValidRootCause("chain_rule", "integration_by_parts"), "chain_rule is root of integration_by_parts");
ok(isValidRootCause("limit_laws", "lhopital_rule"), "limit_laws is root of lhopital_rule");
ok(isValidRootCause("differentiation_rules", "differentiation_rules"), "equal root accepted");
ok(!isValidRootCause("integration_by_parts", "chain_rule"), "reverse direction rejected");
ok(!isValidSkill("nope_not_a_skill"), "unknown id rejected");

const good1 = { items: [{ cau_hoi: "d/dx x^2 at x=3", dap_an_sinh_vien: "6", skill_tag: ["differentiation_rules"] }] };
const good2 = { items: [
  { cau_hoi: "int_0^1 x dx", dap_an_sinh_vien: "", skill_tag: ["definite_integrals", "antiderivatives"] },
  { cau_hoi: "lim x->0 sin x / x", dap_an_sinh_vien: "1", skill_tag: ["limit_laws"] },
]};
ok(DecomposeOutput.safeParse(good1).success, "agent1 sample 1 accepted");
ok(DecomposeOutput.safeParse(good2).success, "agent1 sample 2 accepted");
ok(!DecomposeOutput.safeParse({ items: [] }).success, "agent1 empty items rejected");
ok(!DecomposeOutput.safeParse({ items: [{ cau_hoi: "x", skill_tag: "nope" }] }).success, "agent1 bad shape rejected");

ok(GapOutput.safeParse({ weak_skill: "integration_by_parts", root_cause: "chain_rule", confidence: 0.9 }).success, "agent2 sample 1 accepted");
ok(!GapOutput.safeParse({ weak_skill: "x", root_cause: "y", confidence: 2 }).success, "agent2 confidence>1 rejected");
ok(!GapOutput.safeParse({ weak_skill: "x", confidence: 0.5 }).success, "agent2 missing root rejected");

console.log("CONTRACT TESTS OK: " + n + " assertions");

// Offline tests: batch-scan merge rule + response contract. No network.
// Run: node arena/scripts/test-batch.mjs
// Note: mirrors lib/scan/merge.ts against the REAL skill-graph.json
// (same convention as test-agent-contracts.mjs and test-social.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";

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

// Mirror of mergeGaps in lib/scan/merge.ts.
function mergeGaps(votes) {
  const valid = votes.filter((v) => isValidSkill(v.weak_skill));
  if (valid.length === 0) throw new Error("No valid gaps to merge.");
  const byWeak = new Map();
  for (const v of valid) byWeak.set(v.weak_skill, [...(byWeak.get(v.weak_skill) ?? []), v]);
  let weak = "";
  let best = -1;
  for (const [w, vs] of byWeak) {
    const score = vs.length * 10 + vs.reduce((s, v) => s + v.confidence, 0);
    if (score > best) {
      best = score;
      weak = w;
    }
  }
  const mine = byWeak.get(weak);
  const roots = mine.map((v) => (isValidSkill(v.root_cause) ? v.root_cause : v.weak_skill));
  let root = roots[0];
  let rootScore = -1;
  for (const r of roots) {
    let s = 0;
    for (const o of roots) if (o !== r && isValidRootCause(r, o)) s += 1;
    if (s > rootScore) {
      rootScore = s;
      root = r;
    }
  }
  if (!isValidRootCause(root, weak)) root = weak;
  const confidence = mine.reduce((s, v) => s + v.confidence, 0) / mine.length;
  return { weak_skill: weak, root_cause: root, confidence, votes: mine.length, total: valid.length };
}

const MergedVerdict = z.object({
  weak_skill: z.string().min(1),
  root_cause: z.string().min(1),
  confidence: z.number().min(0).max(1),
  votes: z.number().int().min(1),
  total: z.number().int().min(1),
});
const BatchResponse = z.object({
  photos: z.array(z.object({
    items: z.array(z.object({
      cau_hoi: z.string().min(1),
      dap_an_sinh_vien: z.string(),
      skill_tag: z.array(z.string()),
    })).min(1),
    weak_skill: z.string().min(1),
    root_cause: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })).min(1).max(3),
  merged: MergedVerdict,
  can_summon: z.boolean(),
});

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Majority wins.
let m = mergeGaps([
  { weak_skill: "implicit_differentiation", root_cause: "chain_rule", confidence: 0.6 },
  { weak_skill: "implicit_differentiation", root_cause: "chain_rule", confidence: 0.7 },
  { weak_skill: "lhopital_rule", root_cause: "limit_laws", confidence: 0.95 },
]);
ok(m.weak_skill === "implicit_differentiation", "majority weak wins");
ok(m.votes === 2 && m.total === 3, "vote counts");
ok(Math.abs(m.confidence - 0.65) < 1e-9, "confidence averaged over winners");
ok(m.root_cause === "chain_rule", "unanimous root kept");

// Tie breaks by summed confidence.
m = mergeGaps([
  { weak_skill: "implicit_differentiation", root_cause: "chain_rule", confidence: 0.5 },
  { weak_skill: "lhopital_rule", root_cause: "limit_laws", confidence: 0.9 },
]);
ok(m.weak_skill === "lhopital_rule", "tie breaks to higher confidence");

// Deepest foundation wins: differentiation_rules is a prereq of chain_rule.
m = mergeGaps([
  { weak_skill: "implicit_differentiation", root_cause: "chain_rule", confidence: 0.8 },
  { weak_skill: "implicit_differentiation", root_cause: "differentiation_rules", confidence: 0.8 },
]);
ok(m.root_cause === "differentiation_rules", "deeper root wins, got " + m.root_cause);

// Invalid weak_skill votes are filtered; bad root repairs to weak.
m = mergeGaps([
  { weak_skill: "nope_not_a_skill", root_cause: "chain_rule", confidence: 0.99 },
  { weak_skill: "lhopital_rule", root_cause: "nope_not_a_skill", confidence: 0.5 },
]);
ok(m.weak_skill === "lhopital_rule" && m.total === 1, "invalid weak filtered");
ok(m.root_cause === "lhopital_rule", "invalid root repairs to weak");
assert.throws(() => mergeGaps([{ weak_skill: "nope", root_cause: "nope", confidence: 1 }]), "empty merge throws");
n += 1;

// Contract shape.
const sample = {
  photos: [
    {
      items: [{ cau_hoi: "q?", dap_an_sinh_vien: "a", skill_tag: ["chain_rule"] }],
      weak_skill: "chain_rule",
      root_cause: "differentiation_rules",
      confidence: 0.8,
    },
  ],
  merged: { weak_skill: "chain_rule", root_cause: "differentiation_rules", confidence: 0.8, votes: 1, total: 1 },
  can_summon: true,
};
ok(BatchResponse.safeParse(sample).success, "batch response parses");
ok(!BatchResponse.safeParse({ ...sample, photos: [] }).success, "empty photos rejected");
ok(!BatchResponse.safeParse({ ...sample, photos: [sample.photos[0], sample.photos[0], sample.photos[0], sample.photos[0]] }).success, "4 photos rejected");

console.log(`BATCH TESTS OK: ${n} assertions`);

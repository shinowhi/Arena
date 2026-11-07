// Offline tests: gauntlet skill pick + question build + contracts. No network.
// Run: node arena/scripts/test-gauntlet.mjs
// Note: mirrors lib/agents/gauntlet.ts (same convention as test-revenge.mjs).
import assert from "node:assert/strict";
import { z } from "zod";

// Mirror of pickGauntletSkills in lib/agents/gauntlet.ts.
function pickGauntletSkills(playerSkills, cachedSkills, fallback) {
  const out = [];
  const seen = new Set();
  for (const list of [playerSkills, cachedSkills, fallback]) {
    for (const s of list) {
      if (typeof s !== "string" || s.length === 0 || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

// Mirror of buildGauntletQuestions in lib/agents/gauntlet.ts.
function buildGauntletQuestions(sets) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const set = sets[i];
    if (!Array.isArray(set) || set.length < 5) continue;
    const sorted = [...set].sort((a, b) => a.level - b.level);
    out.push(sorted[i]);
  }
  return out;
}

const GauntletSkills = z.object({ skills: z.array(z.string().min(1)).length(5) });
const SummonOut = z.object({ boss_id: z.string().min(1), skills: z.array(z.string()).length(5) });

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Player skills first, deduped, topped up from cache then fallback.
let s = pickGauntletSkills(["a", "b"], ["b", "c", "d"], ["d", "e", "f"]);
ok(JSON.stringify(s) === JSON.stringify(["a", "b", "c", "d", "e"]), "order + dedupe + topup");
s = pickGauntletSkills(["a", "", "a", 7], [], ["b", "c", "d", "e", "f"]);
ok(JSON.stringify(s) === JSON.stringify(["a", "b", "c", "d", "e"]), "junk skipped");
s = pickGauntletSkills(["a", "b", "c", "d", "e", "f"], [], []);
ok(s.length === 5 && s[4] === "e", "caps at 5");
ok(pickGauntletSkills([], [], []).length === 0, "empty in, empty out");

// Level i+1 taken from set i, unsorted input sorted first.
const mkSet = (tag) => [5, 4, 3, 2, 1].map((lv) => ({ level: lv, tag }));
const built = buildGauntletQuestions([mkSet("s0"), mkSet("s1"), mkSet("s2"), mkSet("s3"), mkSet("s4")]);
ok(built.length === 5, "5 questions built");
ok(built.every((q, i) => q.level === i + 1 && q.tag === `s${i}`), "level i+1 from set i");
// Short sets skipped.
ok(buildGauntletQuestions([mkSet("s0"), [{ level: 1 }]]).length === 1, "short set skipped");
ok(buildGauntletQuestions([null, undefined, "x", [], {}]).length === 0, "junk sets skipped");

// Contracts.
ok(GauntletSkills.safeParse({ skills: ["a", "b", "c", "d", "e"] }).success, "GET skills parse");
ok(!GauntletSkills.safeParse({ skills: ["a", "b"] }).success, "short list rejected");
ok(SummonOut.safeParse({ boss_id: "u", skills: ["a", "b", "c", "d", "e"] }).success, "POST summon parses");

console.log(`GAUNTLET TESTS OK: ${n} assertions`);

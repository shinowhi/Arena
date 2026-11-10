// Offline tests: transparency aggregation. No network.
// Run: node arena/scripts/test-transparency.mjs
// Note: mirrors app/api/transparency/route.ts.
import assert from "node:assert/strict";

const V1_FRESH_MS = 12 * 3600 * 1000;
const V2_FRESH_MS = 48 * 3600 * 1000;

function summarize(v1rows, v2rows, now) {
  let verifiedQ = 0;
  let draftQ = 0;
  for (const r of v2rows) {
    // Route validates the whole array: any invalid element skips the row.
    if (!Array.isArray(r.questions)) continue;
    if (!r.questions.every((q) => q && (q.tier === "verified" || q.tier === "draft"))) continue;
    for (const q of r.questions) {
      if (q.tier === "verified") verifiedQ += 1;
      else draftQ += 1;
    }
  }
  const newest = [...v1rows, ...v2rows]
    .map((r) => new Date(r.fetched_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] ?? null;
  return {
    bossTotal: v1rows.length,
    bossFresh: v1rows.filter((r) => now - new Date(r.fetched_at).getTime() <= V1_FRESH_MS).length,
    examTotal: v2rows.length,
    examFresh: v2rows.filter((r) => now - new Date(r.fetched_at).getTime() <= V2_FRESH_MS).length,
    verifiedQ,
    draftQ,
    newest,
  };
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const NOW = new Date("2026-11-09T12:00:00Z").getTime();
const h = (hrs) => new Date(NOW - hrs * 3600 * 1000).toISOString();
const v1 = [{ skill_tag: "a", fetched_at: h(1) }, { skill_tag: "b", fetched_at: h(13) }];
const v2 = [
  { skill_tag: "s1", fetched_at: h(2), questions: [{ tier: "verified" }, { tier: "draft" }] },
  { skill_tag: "s2", fetched_at: h(50), questions: [{ tier: "draft" }] },
  { skill_tag: "s3", fetched_at: h(3), questions: "corrupt" },
  { skill_tag: "s4", fetched_at: h(3), questions: [{ tier: "verified" }, { tier: "bogus" }] },
];
const r = summarize(v1, v2, NOW);
ok(r.bossTotal === 2 && r.bossFresh === 1, "v1 12h freshness");
ok(r.examTotal === 4 && r.examFresh === 3, "v2 48h freshness");
ok(r.verifiedQ === 1 && r.draftQ === 2, "tier counts skip corrupt + partial rows");
ok(r.newest === NOW - 3600 * 1000, "newest fetch");
const empty = summarize([], [], NOW);
ok(empty.bossTotal === 0 && empty.newest === null, "empty bank safe");

console.log(`TRANSPARENCY TESTS OK: ${n} assertions`);

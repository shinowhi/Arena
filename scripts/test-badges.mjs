// Offline tests: weekly badge evaluation + contract. No network.
// Run: node arena/scripts/test-badges.mjs
// Note: mirrors lib/game/badges.ts (same convention as test-revenge.mjs).
import assert from "node:assert/strict";
import { z } from "zod";

// Mirror of evaluateBadges in lib/game/badges.ts.
function evaluateBadges(c) {
  const mk = (id, name, desc, progress, target) => ({ id, name, desc, earned: progress >= target, progress, target });
  return [
    mk("first_blood", "First Blood", "Land 1 correct hit this week.", c.correctHits, 1),
    mk("sharpshooter", "Sharpshooter", "Land 10 correct hits this week.", c.correctHits, 10),
    mk("slayer", "Slayer", "Slay 1 of your own bosses this week.", c.slain, 1),
    mk("scholar", "Scholar", "Scan 3 times this week.", c.scans, 3),
    mk("grinder", "Grinder", "Be active on 3 different days this week.", c.activeDays, 3),
    mk("flawless", "Flawless", "Answer 5/5 on one boss this week.", c.bestBossCorrect, 5),
  ];
}

const Badge = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  earned: z.boolean(),
  progress: z.number().int().min(0),
  target: z.number().int().positive(),
});

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const zero = { scans: 0, correctHits: 0, activeDays: 0, slain: 0, bestBossCorrect: 0 };
let bs = evaluateBadges(zero);
ok(bs.length === 6, "six badges defined");
ok(bs.every((b) => b.earned === false), "fresh week earns nothing");
ok(new Set(bs.map((b) => b.id)).size === 6, "badge ids unique");

// Partial progress earns only what it reaches.
bs = evaluateBadges({ scans: 3, correctHits: 4, activeDays: 2, slain: 0, bestBossCorrect: 3 });
const byId = new Map(bs.map((b) => [b.id, b]));
ok(byId.get("scholar").earned === true, "3 scans earns scholar");
ok(byId.get("first_blood").earned === true, "4 hits earns first blood");
ok(byId.get("sharpshooter").earned === false && byId.get("sharpshooter").progress === 4, "4/10 sharpshooter pending");
ok(byId.get("grinder").earned === false, "2 days earns no grinder");
ok(byId.get("slayer").earned === false && byId.get("flawless").earned === false, "slayer + flawless pending");

// Full week earns everything.
bs = evaluateBadges({ scans: 5, correctHits: 12, activeDays: 4, slain: 1, bestBossCorrect: 5 });
ok(bs.every((b) => b.earned === true), "full week earns all six");

// Contract: every badge shape parses; bad shapes rejected.
for (const b of bs) ok(Badge.safeParse(b).success, `badge ${b.id} parses`);
ok(!Badge.safeParse({ ...bs[0], target: 0 }).success, "zero target rejected");
ok(!Badge.safeParse({ ...bs[0], progress: -1 }).success, "negative progress rejected");

// Mirror of countBadgeStats in lib/game/badges.ts.
function countBadgeStats(attacks, scans, slain) {
  const days = new Set();
  for (const r of scans) {
    if (typeof r.created_at === "string") days.add(r.created_at.slice(0, 10));
  }
  const seen = new Set();
  const perBoss = new Map();
  let correctHits = 0;
  for (const a of attacks) {
    if (typeof a.created_at === "string") days.add(a.created_at.slice(0, 10));
    if (!a.correct) continue;
    const key = `${a.boss_id}:${a.question_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    correctHits += 1;
    let set = perBoss.get(a.boss_id);
    if (!set) {
      set = new Set();
      perBoss.set(a.boss_id, set);
    }
    set.add(a.question_index);
  }
  let bestBossCorrect = 0;
  for (const s of perBoss.values()) bestBossCorrect = Math.max(bestBossCorrect, s.size);
  return { scans: scans.length, correctHits, activeDays: days.size, slain, bestBossCorrect };
}

const atk = (boss, q, correct, day) => ({ boss_id: boss, question_index: q, correct, created_at: `${day}T10:00:00Z` });
// Replaying one correct answer counts once.
let st = countBadgeStats(
  [atk("b1", 0, true, "2026-11-06"), atk("b1", 0, true, "2026-11-06"), atk("b1", 0, true, "2026-11-06")],
  [],
  0,
);
ok(st.correctHits === 1 && st.bestBossCorrect === 1, "replay deduped to 1 hit");
// Distinct questions across bosses accumulate; days dedupe.
st = countBadgeStats(
  [
    atk("b1", 0, true, "2026-11-06"),
    atk("b1", 1, true, "2026-11-06"),
    atk("b2", 0, true, "2026-11-05"),
    atk("b2", 1, false, "2026-11-05"),
  ],
  [{ created_at: "2026-11-06T09:00:00Z" }, { created_at: "2026-11-04T09:00:00Z" }],
  1,
);
ok(st.correctHits === 3, "3 distinct hits counted");
ok(st.bestBossCorrect === 2, "best boss has 2 distinct");
ok(st.activeDays === 3 && st.scans === 2 && st.slain === 1, "days/scans/slain counted");
// Null timestamps never crash the derivation.
st = countBadgeStats(
  [{ boss_id: "b1", question_index: 0, correct: true, created_at: null }],
  [{ created_at: null }],
  0,
);
ok(st.correctHits === 1 && st.activeDays === 0 && st.scans === 1, "null created_at safe");

console.log(`BADGES TESTS OK: ${n} assertions`);

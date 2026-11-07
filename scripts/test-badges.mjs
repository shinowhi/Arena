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
    mk("scholar", "Scholar", "Scan 3 works this week.", c.scans, 3),
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

console.log(`BADGES TESTS OK: ${n} assertions`);

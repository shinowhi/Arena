// Offline tests: raid rotation, idempotency key, despawn window, API strip.
// Run: node arena/scripts/test-raid.mjs
// Note: mirrors lib/raid/raid.ts (raidSkillFor, raidSpawnKey, raidDespawnMs,
// toPublicRaid) — keep in sync.
import assert from "node:assert/strict";

// Mirrors of lib/raid/raid.ts.
const RAID_DAY_MS = 86400000;
const RAID_TTL_MS = 3 * 3600 * 1000;

function raidDayNumber(nowMs = Date.now()) {
  return Math.floor(nowMs / RAID_DAY_MS);
}

function parseRaidSlot(slotParam) {
  return slotParam !== null && /^\d+$/.test(slotParam) ? Number(slotParam) : 0;
}

function raidSkillFor(slotParam, dayNumber, ids) {
  if (ids.length === 0) return null;
  return ids[(parseRaidSlot(slotParam) + dayNumber) % ids.length] ?? null;
}

function raidSpawnKey(slotParam, nowMs = Date.now()) {
  return `raid:${raidDayNumber(nowMs)}:${parseRaidSlot(slotParam)}`;
}

function raidDespawnMs(nowMs) {
  return nowMs + RAID_TTL_MS;
}

function toPublicRaid(row, name, nowMs = Date.now()) {
  return {
    id: row.id,
    skill_tag: row.skill_tag,
    name,
    rarity: row.rarity,
    current_hp: row.current_hp,
    max_hp: row.max_hp,
    despawn_at: row.despawn_at,
    seconds_left: Math.max(0, Math.floor((Date.parse(row.despawn_at) - nowMs) / 1000)),
  };
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const IDS = ["chain_rule", "lhopital_rule", "integration_by_parts", "u_substitution", "shell_method"];
const DAY = Math.floor(Date.UTC(2026, 4, 10) / RAID_DAY_MS);
const T0 = DAY * RAID_DAY_MS;

// Rotation: deterministic (slot + day) over skills, garbage slot behaves as 0.
ok(raidSkillFor("1", DAY, IDS) === IDS[(1 + DAY) % IDS.length], "numeric slot offsets rotation");
ok(raidSkillFor("1", DAY, IDS) === raidSkillFor("1", DAY, IDS), "same slot+day picks same skill");
ok(raidSkillFor(null, DAY, IDS) === IDS[DAY % IDS.length], "missing slot behaves as 0");
ok(raidSkillFor("abc", DAY, IDS) === raidSkillFor("0", DAY, IDS), "non-numeric slot behaves as 0");
ok(raidSkillFor("-5", DAY, IDS) === raidSkillFor("0", DAY, IDS), "negative slot behaves as 0");
ok(raidSkillFor("3x", DAY, IDS) === raidSkillFor("0", DAY, IDS), "partial numeric slot behaves as 0");
ok(raidSkillFor("0", DAY, IDS) !== raidSkillFor("0", DAY + 1, IDS), "rotation advances each day");
ok(raidSkillFor("0", DAY, []) === null, "empty skill list yields null");

// Idempotency key: one raid per slot per UTC day.
ok(raidSpawnKey("1", T0) === `raid:${DAY}:1`, "key shape is raid:<day>:<slot>");
ok(raidSpawnKey("abc", T0) === `raid:${DAY}:0`, "key garbage slot folds to 0");
ok(raidSpawnKey("0", T0) !== raidSpawnKey("1", T0), "key differs across slots");
ok(raidSpawnKey("0", T0) !== raidSpawnKey("0", T0 + RAID_DAY_MS), "key differs across days");

// Despawn window: exactly 3h from spawn.
ok(raidDespawnMs(T0) - T0 === 3 * 3600 * 1000, "despawn is spawn + 3h");
ok(
  new Date(raidDespawnMs(T0)).toISOString() === new Date(T0 + 10800000).toISOString(),
  "despawn ISO round-trips the 3h window",
);

// Strip: public shape carries banner fields only, never questions.
const NOW = Date.UTC(2026, 4, 10, 12, 0, 0);
const row = {
  id: "boss-1",
  skill_tag: "chain_rule",
  rarity: "ELITE",
  current_hp: 1500,
  max_hp: 2000,
  despawn_at: new Date(NOW + 7545000).toISOString(),
  questions: [{ level: 1 }],
};
const pub = toPublicRaid(row, "Chain Rule", NOW);
ok(!("questions" in pub), "public raid has no questions field");
ok(
  Object.keys(pub).sort().join(",") ===
    "current_hp,despawn_at,id,max_hp,name,rarity,seconds_left,skill_tag",
  "public raid has exactly the 8 banner fields",
);
ok(pub.seconds_left === 7545, "seconds_left counts down to despawn");
ok(pub.name === "Chain Rule", "skill name passes through");
ok(
  toPublicRaid({ ...row, despawn_at: new Date(NOW - 1000).toISOString() }, "Chain Rule", NOW)
    .seconds_left === 0,
  "seconds_left clamps at 0 past despawn",
);

console.log(`RAID TESTS OK: ${n} assertions`);

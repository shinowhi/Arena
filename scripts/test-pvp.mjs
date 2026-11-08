// Offline tests: PVP room derivation. No network.
// Run: node arena/scripts/test-pvp.mjs
// Note: mirrors lib/game/pvp.ts (same convention as test-badges.mjs).
import assert from "node:assert/strict";

const PVP_START_HP = 100;
const PVP_SELF_MISS = 10;
const PVP_ENEMY_HIT = 20;

// Mirror of pvpCorrectOf + pvpHp + pvpRoom in lib/game/pvp.ts.
function pvpCorrectOf(mine) {
  const good = new Set();
  let misses = 0;
  for (const a of mine) {
    if (a.correct) good.add(a.question_index);
    else misses += 1;
  }
  return { good, misses };
}
const pvpHp = (ownMisses, enemySideCorrects) => PVP_START_HP - PVP_SELF_MISS * ownMisses - PVP_ENEMY_HIT * enemySideCorrects;
function pvpRoom(claims, attacks) {
  const byPlayer = new Map();
  for (const a of attacks) {
    if (!byPlayer.has(a.player_id)) byPlayer.set(a.player_id, []);
    byPlayer.get(a.player_id).push(a);
  }
  const stats = new Map();
  for (const c of claims) stats.set(c.player_id, pvpCorrectOf(byPlayer.get(c.player_id) ?? []));
  const sideCorrect = (side) => claims.reduce((s, c) => s + (c.side === side ? (stats.get(c.player_id)?.good.size ?? 0) : 0), 0);
  const correctA = sideCorrect("A");
  const correctB = sideCorrect("B");
  const fighters = claims.map((c) => {
    const st = stats.get(c.player_id) ?? { good: new Set(), misses: 0 };
    return {
      player_id: c.player_id,
      side: c.side,
      correct: st.good.size,
      misses: st.misses,
      hp: pvpHp(st.misses, c.side === "A" ? correctB : correctA),
      answered: [0, 1, 2, 3, 4].map((i) => (st.good.has(i) ? 1 : 0)),
    };
  });
  const sideA = fighters.filter((f) => f.side === "A");
  const sideB = fighters.filter((f) => f.side === "B");
  if (sideA.length === 0 || sideB.length === 0) return { fighters, finished: false, winnerSide: null, draw: false };
  const deadA = sideA.every((f) => f.hp <= 0);
  const deadB = sideB.every((f) => f.hp <= 0);
  if (!deadA && !deadB) return { fighters, finished: false, winnerSide: null, draw: false };
  const hpA = sideA.reduce((s, f) => s + f.hp, 0);
  const hpB = sideB.reduce((s, f) => s + f.hp, 0);
  if (deadA && deadB) {
    if (hpA === hpB) return { fighters, finished: true, winnerSide: null, draw: true };
    return { fighters, finished: true, winnerSide: hpA > hpB ? "A" : "B", draw: false };
  }
  return { fighters, finished: true, winnerSide: deadA ? "B" : "A", draw: false };
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const atk = (p, q, correct) => ({ player_id: p, question_index: q, correct });
const claims12 = [{ player_id: "p1", side: "A" }, { player_id: "p2", side: "B" }];

// Fresh room: full HP, running.
let r = pvpRoom(claims12, []);
ok(r.finished === false && r.fighters.every((f) => f.hp === 100), "fresh room 100/100 running");
// Correct hurts the enemy side only.
r = pvpRoom(claims12, [atk("p1", 0, true)]);
ok(r.fighters.find((f) => f.player_id === "p2").hp === 80, "enemy takes 20");
ok(r.fighters.find((f) => f.player_id === "p1").hp === 100, "attacker unhurt");
// Miss hurts self only.
r = pvpRoom(claims12, [atk("p1", 0, false)]);
ok(r.fighters.find((f) => f.player_id === "p1").hp === 90, "miss costs self 10");
ok(r.fighters.find((f) => f.player_id === "p2").hp === 100, "enemy untouched by miss");
// Repeats don't stack corrects.
r = pvpRoom(claims12, [atk("p1", 0, true), atk("p1", 0, true)]);
ok(r.fighters.find((f) => f.player_id === "p2").hp === 80, "repeat correct adds nothing");
// 1v1 finish: 5 distinct corrects sink the enemy.
r = pvpRoom(claims12, [0, 1, 2, 3, 4].map((q) => atk("p1", q, true)));
ok(r.finished === true && r.winnerSide === "A" && r.draw === false, "5/5 wins 1v1");
// Miss-out: 10 misses sinks self.
r = pvpRoom(claims12, Array.from({ length: 10 }, () => atk("p2", 0, false)));
ok(r.finished === true && r.winnerSide === "A", "10 misses loses");
// Lone side waits, never finishes.
r = pvpRoom([{ player_id: "p1", side: "A" }], []);
ok(r.finished === false && r.winnerSide === null, "waiting room runs");
// Teams: side falls only when every fighter falls.
const claims4 = [
  { player_id: "a1", side: "A" }, { player_id: "a2", side: "A" },
  { player_id: "b1", side: "B" }, { player_id: "b2", side: "B" },
];
r = pvpRoom(claims4, [0, 1, 2, 3, 4].map((q) => atk("a1", q, true)));
ok(r.finished === true && r.winnerSide === "A", "5 teams hits sink side B (both at 0), A wins");
ok(r.fighters.find((f) => f.player_id === "b1").hp === 0, "splash hits every enemy fighter");
// Mutual wipeout compares side HP; exact tie draws.
const wipeA = [0, 1, 2, 3, 4].map((q) => atk("a1", q, true));
const wipeB = [0, 1, 2, 3, 4].map((q) => atk("b1", q, true));
r = pvpRoom(claims4, [...wipeA, ...wipeB]);
ok(r.finished === true && r.draw === true && r.winnerSide === null, "symmetric wipeout draws");
r = pvpRoom(claims4, [...wipeA, ...wipeB, atk("a2", 0, false)]);
ok(r.finished === true && r.winnerSide === "B", "worse side HP loses the wipeout");

console.log(`PVP TESTS OK: ${n} assertions`);

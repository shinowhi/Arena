// Offline tests: adaptive engine math. No network.
// Run: node arena/scripts/test-adaptive.mjs
// Note: mirrors lib/game/adaptive.ts.
import assert from "node:assert/strict";

const ADAPT_K = 24;
const START_RATING = 1000;
function levelRating(level) {
  const l = Math.min(5, Math.max(1, Math.round(level)));
  return 800 + l * 100;
}
function updateRating(rating, level, correct) {
  const q = levelRating(level);
  const expected = 1 / (1 + Math.pow(10, (q - rating) / 400));
  return Math.round(rating + ADAPT_K * ((correct ? 1 : 0) - expected));
}
function levelForRating(rating) {
  if (rating < 950) return 1;
  if (rating < 1050) return 2;
  if (rating < 1150) return 3;
  if (rating < 1250) return 4;
  return 5;
}
function sm2Next(reps, intervalDays, quality) {
  if (quality < 3) return { reps: 0, intervalDays: 1 };
  const r = reps + 1;
  if (r === 1) return { reps: r, intervalDays: 1 };
  if (r === 2) return { reps: r, intervalDays: 6 };
  return { reps: r, intervalDays: Math.round(intervalDays * 2.5) };
}
function lowestRated(stats, candidates) {
  let best = null;
  let bestKey = "";
  for (const id of candidates) {
    const s = stats[id] ?? { rating: START_RATING, games: 0 };
    const key = `${String(Math.floor(s.rating / 25)).padStart(6, "0")}:${String(s.games).padStart(6, "0")}:${id}`;
    if (best === null || key < bestKey) {
      best = id;
      bestKey = key;
    }
  }
  return best;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Ratings move the right way, harder wins pay more.
ok(updateRating(1000, 1, true) > 1000, "easy win gains");
ok(updateRating(1000, 5, true) > updateRating(1000, 1, true), "hard win pays more");
ok(updateRating(1000, 1, false) < 1000, "easy loss drops");
ok(updateRating(1000, 1, false) < updateRating(1000, 5, false), "easy loss hurts more");
// Ramp: 5 straight correct climbs levels.
let r = 1000;
for (let i = 0; i < 5; i++) r = updateRating(r, levelForRating(r), true);
ok(levelForRating(r) >= 3, "win streak ramps level, rating " + r);
// Slump: 5 straight wrong sinks.
r = 1000;
for (let i = 0; i < 5; i++) r = updateRating(r, levelForRating(r), false);
ok(levelForRating(r) === 1 && r < 1000, "loss streak sinks, rating " + r);
// Level boundaries exact.
ok(levelForRating(949) === 1 && levelForRating(950) === 2, "L1/L2 edge");
ok(levelForRating(1149) === 3 && levelForRating(1150) === 4, "L3/L4 edge");
ok(levelForRating(2000) === 5, "ceiling L5");
ok(levelForRating(1049) === 2 && levelForRating(1050) === 3, "L2/L3 edge");
ok(levelForRating(1249) === 4 && levelForRating(1250) === 5, "L4/L5 edge");
ok(sm2Next(2, 6, 2).reps === 0 && sm2Next(2, 6, 3).reps === 3, "quality 2-vs-3 edge");
ok(lowestRated({ a: { rating: 1000, games: 9 }, b: { rating: 1024, games: 0 } }, ["a", "b"]) === "b", "bucket tiebreak games");
// SM-2: 1 → 6 → 15 → reset on fail.
let s = sm2Next(0, 1, 5);
ok(s.reps === 1 && s.intervalDays === 1, "sm2 first");
s = sm2Next(s.reps, s.intervalDays, 5);
ok(s.intervalDays === 6, "sm2 second 6d");
s = sm2Next(s.reps, s.intervalDays, 5);
ok(s.intervalDays === 15, "sm2 grows x2.5");
s = sm2Next(s.reps, s.intervalDays, 0);
ok(s.reps === 0 && s.intervalDays === 1, "sm2 fail resets");
// weakest-first pick, fewest games breaks near-ties, fresh skills eligible.
ok(lowestRated({ a: { rating: 900, games: 3 }, b: { rating: 1100, games: 1 } }, ["a", "b"]) === "a", "weakest wins");
ok(lowestRated({ a: { rating: 1000, games: 5 }, b: { rating: 1000, games: 1 } }, ["a", "b"]) === "b", "fewer games wins tie");
ok(lowestRated({}, ["x", "y"]) === "x", "fresh deterministic");
ok(lowestRated({}, []) === null, "empty pool null");

console.log(`ADAPTIVE TESTS OK: ${n} assertions`);

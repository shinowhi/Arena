// Offline tests: exam duel rules. No network.
// Run: node arena/scripts/test-duel.mjs
// Note: mirrors lib/game/duel.ts.
import assert from "node:assert/strict";

// Mirror of eloUpdate + decideWinner + canSubmit + eloScore in duel.ts.
const K = 32;
function eloUpdate(ra, rb, scoreA) {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const na = Math.round(ra + K * (scoreA - ea));
  const nb = Math.round(rb + K * ((1 - scoreA) - (1 - ea)));
  return { na, nb };
}
function decideWinner(p1, p2) {
  if (!p1 || !p2) return null;
  if (p1.score !== p2.score) return p1.score > p2.score ? "p1" : "p2";
  const t1 = new Date(p1.doneAt).getTime();
  const t2 = new Date(p2.doneAt).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t1 === t2) return "draw";
  return t1 < t2 ? "p1" : "p2";
}
function sideOf(d, pid) {
  if (d.p1_player_id === pid) return "p1";
  if (d.p2_player_id === pid) return "p2";
  return null;
}
function canSubmit(d, pid) {
  if (d.status !== "live") return false;
  const s = sideOf(d, pid);
  if (!s) return false;
  return s === "p1" ? d.p1_score === null : d.p2_score === null;
}
function eloScore(w, side) {
  if (!w || w === "draw") return 0.5;
  return w === side ? 1 : 0;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// ELO: equal ratings split 16/16 on decisive, hold on draw.
let r = eloUpdate(1200, 1200, 1);
ok(r.na === 1216 && r.nb === 1184, "equal decisive 16/16");
r = eloUpdate(1200, 1200, 0.5);
ok(r.na === 1200 && r.nb === 1200, "equal draw holds");
// Underdog wins big, favorite gains little.
r = eloUpdate(1000, 1400, 1);
ok(r.na - 1000 >= 25 && 1400 - r.nb >= 25, "underdog upset swings");
r = eloUpdate(1400, 1000, 1);
ok(r.na - 1400 <= 5 && r.na > 1400, "favorite win small gain");
// ELO is zero-sum (up to rounding dust of 1).
r = eloUpdate(1310, 1277, 0);
ok(Math.abs(r.na + r.nb - 1310 - 1277) <= 1, "elo zero-sum");
// Winner: score first, then speed, then draw.
ok(decideWinner({ score: 8, doneAt: "2026-11-09T02:00:00Z" }, { score: 6, doneAt: "2026-11-09T01:00:00Z" }) === "p1", "score beats speed");
ok(decideWinner({ score: 7, doneAt: "2026-11-09T02:00:00Z" }, { score: 7, doneAt: "2026-11-09T01:00:00Z" }) === "p2", "tie goes faster");
ok(decideWinner({ score: 7, doneAt: "2026-11-09T01:00:00Z" }, { score: 7, doneAt: "2026-11-09T01:00:00Z" }) === "draw", "same ms draws");
ok(decideWinner({ score: 7, doneAt: "x" }, { score: 7, doneAt: "2026-11-09T01:00:00Z" }) === "draw", "bad clock draws");
ok(decideWinner(null, { score: 7, doneAt: "2026-11-09T01:00:00Z" }) === null, "unfinished undecided");
// Submit-once + membership.
const d = { p1_player_id: "a", p2_player_id: "b", p1_score: null, p2_score: 5, status: "live" };
ok(canSubmit(d, "a") === true, "pending member can submit");
ok(canSubmit(d, "b") === false, "submitted member blocked");
ok(canSubmit(d, "c") === false, "stranger blocked");
ok(canSubmit({ ...d, status: "finished" }, "a") === false, "finished duel locked");
ok(canSubmit({ ...d, status: "waiting" }, "a") === false, "waiting member blocked");
// Score mapping.
ok(eloScore("p1", "p1") === 1 && eloScore("p1", "p2") === 0, "win/loss maps");
ok(eloScore("draw", "p1") === 0.5 && eloScore(null, "p2") === 0.5, "draw maps");

console.log(`DUEL TESTS OK: ${n} assertions`);

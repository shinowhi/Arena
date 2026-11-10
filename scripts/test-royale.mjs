// Offline tests: battle royale rules. No network.
// Run: node arena/scripts/test-royale.mjs
// Note: mirrors lib/game/royale.ts.
import assert from "node:assert/strict";

function rankPlayers(players) {
  return [...players].sort((a, b) => b.score - a.score || a.last_ms - b.last_ms);
}
function closeRound(players, round, totalRounds) {
  const aliveNow = players.filter((p) => p.alive);
  const outs = aliveNow.filter((p) => p.answered < round).map((p) => p.player_id);
  const outSet = new Set(outs);
  const survivors = aliveNow.filter((p) => !outSet.has(p.player_id));
  if (survivors.length === 0) {
    const top = rankPlayers(players)[0] ?? null;
    return { outs, finished: true, winner: top ? top.player_id : null };
  }
  if (survivors.length === 1) return { outs, finished: true, winner: survivors[0].player_id };
  const lastRound = round + 1 >= totalRounds;
  if (lastRound) {
    const top = rankPlayers(survivors)[0];
    return { outs, finished: true, winner: top.player_id };
  }
  const ranked = [...survivors].sort((a, b) => b.last_ms - a.last_ms);
  const slowest = ranked[0].player_id;
  const rest = survivors.filter((p) => p.player_id !== slowest);
  if (rest.length === 1) return { outs: [...outs, slowest], finished: true, winner: rest[0].player_id };
  return { outs: [...outs, slowest], finished: false, winner: null };
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const P = (id, o = {}) => ({ player_id: id, alive: true, score: 0, answered: 0, last_ms: 1000, ...o });
// Timeout out + slowest out, game continues with 3 → out 2, 1 left wins.
let r = closeRound([P("a", { answered: 0, last_ms: 500 }), P("b", { answered: -1 }), P("c", { answered: 0, last_ms: 9000 })], 0, 10);
ok(r.outs.includes("b") && r.outs.includes("c") && r.finished && r.winner === "a", "timeout + slowest, champ crowned");
// All correct, slowest out, continues.
r = closeRound([P("a", { last_ms: 100 }), P("b", { last_ms: 200 }), P("c", { last_ms: 300 }), P("d", { last_ms: 400 })], 0, 10);
ok(r.outs.length === 1 && r.outs[0] === "d" && !r.finished && r.winner === null, "slowest out, continues");
// Everyone dead same round: top score wins.
r = closeRound([P("a", { alive: false, score: 5 }), P("b", { alive: false, score: 7 })], 3, 10);
ok(r.finished && r.winner === "b", "all dead top score wins");
// Last round: top score among survivors wins, no slowest-out.
r = closeRound([P("a", { score: 9, last_ms: 9000, answered: 9 }), P("b", { score: 6, last_ms: 100, answered: 9 })], 9, 10);
ok(r.finished && r.winner === "a" && r.outs.length === 0, "final ranks by score");
// Lone survivor wins immediately.
r = closeRound([P("a", { answered: 2 }), P("b", { alive: false })], 2, 10);
ok(r.finished && r.winner === "a", "lone survivor wins");
// Timeout leaves one standing.
r = closeRound([P("a", { answered: 2 }), P("b", { answered: 0 })], 2, 10);
ok(r.outs.length === 1 && r.outs[0] === "b" && r.finished && r.winner === "a", "timeout leaves one");
// All timeout: top score of the room wins.
r = closeRound([P("a", { score: 4, answered: 0 }), P("b", { score: 6, answered: 1 })], 2, 10);
ok(r.finished && r.winner === "b", "all timeout top score wins");
// Rank ties break by speed.
const ranked = rankPlayers([P("a", { score: 5, last_ms: 2000 }), P("b", { score: 5, last_ms: 500 })]);
ok(ranked[0].player_id === "b", "rank tiebreak speed");

console.log(`ROYALE TESTS OK: ${n} assertions`);

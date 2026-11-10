// Offline tests: ELO parity reference for the settle_duel_elo RPC (0010).
// Run: node arena/scripts/test-elo-rpc.mjs
// Note: mirrors eloUpdate in lib/game/duel.ts. After running migration 0010,
// a human can compare: select settle_duel_elo(...) must move ratings by the
// same deltas asserted here (K=32, round-half-up on positive values).
import assert from "node:assert/strict";

// Mirror of eloUpdate in lib/game/duel.ts.
const K = 32;
function eloUpdate(ra, rb, scoreA) {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const na = Math.round(ra + K * (scoreA - ea));
  const nb = Math.round(rb + K * ((1 - scoreA) - (1 - ea)));
  return { na, nb };
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Equal ratings, A wins: 1216 / 1184.
let r = eloUpdate(1200, 1200, 1);
ok(r.na === 1216 && r.nb === 1184, "equal win 1216/1184");
// Equal ratings, A loses: 1184 / 1216.
r = eloUpdate(1200, 1200, 0);
ok(r.na === 1184 && r.nb === 1216, "equal loss 1184/1216");
// 1400 vs 1200, favorite loses: 1376 / 1224.
r = eloUpdate(1400, 1200, 0);
ok(r.na === 1376 && r.nb === 1224, "upset loss 1376/1224");

console.log(`ELO RPC TESTS OK: ${n} assertions`);

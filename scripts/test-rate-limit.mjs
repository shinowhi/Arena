// Offline tests: in-memory rate limiter. No network.
// Run: node arena/scripts/test-rate-limit.mjs
// Note: mirrors checkRate in lib/rate-limit.ts.
import assert from "node:assert/strict";

// Mirror of checkRate in lib/rate-limit.ts.
const buckets = new Map();
let lastSweep = 0;
function checkRate(key, limit, windowMs, now = Date.now()) {
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { used: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (cur.used < limit) {
    cur.used += 1;
    return { ok: true, retryAfterSec: 0 };
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const T0 = 1_000_000;
const MIN = 60_000;
// Allow under the limit (3/min): first three pass.
ok(checkRate("a", 3, MIN, T0).ok === true, "first request allowed");
ok(checkRate("a", 3, MIN, T0).ok === true && checkRate("a", 3, MIN, T0).ok === true, "up to limit allowed");
// Over the limit: blocked with a 60s retry.
const blocked = checkRate("a", 3, MIN, T0);
ok(blocked.ok === false, "over limit blocked");
ok(blocked.retryAfterSec === 60, "retryAfter is full window at block time");
// Still blocked just before reset; open exactly at reset.
ok(checkRate("a", 3, MIN, T0 + MIN - 1).ok === false, "blocked just before reset");
ok(checkRate("a", 3, MIN, T0 + MIN).ok === true, "allowed at window reset");
// Keys are independent.
ok(checkRate("b", 3, MIN, T0).ok === true, "separate key unaffected");
// Retry counts down as the window drains.
ok(
  checkRate("c", 1, MIN, T0).ok === true && checkRate("c", 1, MIN, T0 + 1000).retryAfterSec === 59,
  "retryAfter counts down",
);
// Lazy sweep evicts expired buckets so the map stays bounded.
checkRate("sweep-probe", 1, MIN, T0 + 2 * MIN + 1);
ok(buckets.size === 1 && buckets.has("sweep-probe"), "expired buckets swept");

console.log(`RATE LIMIT TESTS OK: ${n} assertions`);

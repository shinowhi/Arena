// Offline tests: cron prime auth + slot rotation. No network.
// Run: node arena/scripts/test-cron.mjs
// Note: mirrors isCronAuthorized/primeSlotIndex in app/api/cron/prime/route.ts.
import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";

// Mirror of isCronAuthorized in app/api/cron/prime/route.ts.
function isCronAuthorized(authHeader, secret) {
  if (!secret || typeof authHeader !== "string" || authHeader.length === 0) return false;
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Mirror of primeSlotIndex in app/api/cron/prime/route.ts.
const DAY_MS = 86400000;
function primeSlotIndex(slotParam, count, nowMs = Date.now()) {
  if (count <= 0) return 0;
  const day = Math.floor(nowMs / DAY_MS);
  const slot = slotParam !== null && /^\d+$/.test(slotParam) ? Number(slotParam) : 0;
  return (slot + day) % count;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Auth: exact bearer match only, unset secret rejects everything.
ok(isCronAuthorized("Bearer s3cret", "s3cret") === true, "correct bearer accepted");
ok(isCronAuthorized("Bearer wrong", "s3cret") === false, "wrong bearer rejected");
ok(isCronAuthorized(null, "s3cret") === false, "missing header rejected");
ok(isCronAuthorized("Bearer s3cret", undefined) === false, "unset secret rejects all");
ok(isCronAuthorized("bearer s3cret", "s3cret") === false, "scheme is case-sensitive");

// Slot parsing: numeric offsets the day rotation, garbage behaves as 0.
const DAY = Math.floor(Date.UTC(2026, 0, 15) / DAY_MS);
const T0 = DAY * DAY_MS;
ok(primeSlotIndex("20", 81, T0) === (20 + DAY) % 81, "numeric slot offsets rotation");
ok(primeSlotIndex(null, 81, T0) === DAY % 81, "missing slot behaves as 0");
ok(primeSlotIndex("abc", 81, T0) === DAY % 81, "non-numeric slot behaves as 0");
ok(primeSlotIndex("-5", 81, T0) === DAY % 81, "negative slot behaves as 0");
ok(primeSlotIndex("3x", 81, T0) === DAY % 81, "partial numeric slot behaves as 0");
ok(primeSlotIndex("0", 0, T0) === 0, "empty skill list yields 0");
ok(primeSlotIndex("0", 81, T0) !== primeSlotIndex("0", 81, T0 + DAY_MS), "rotation advances each day");

console.log(`CRON PRIME TESTS OK: ${n} assertions`);

// Offline tests: VIP pure rules (quota, extension math, code validation).
// Run: node arena/scripts/test-vip.mjs
// Note: mirrors quotaAllowed/extendVip/normalizeCode in lib/vip.ts, plus the
// admin-create min-length rule (codes-route zod + admin_create_code guards).
import assert from "node:assert/strict";

const VIP_DAYS = 30;
function quotaAllowed(usedToday, limit, vip) {
  if (vip) return true;
  return usedToday < limit;
}
function extendVip(currentIso, now) {
  const nowMs = now.getTime();
  const curMs = currentIso ? Date.parse(currentIso) : NaN;
  const base = Number.isFinite(curMs) && curMs > nowMs ? curMs : nowMs;
  return new Date(base + VIP_DAYS * 86400_000).toISOString();
}
function normalizeCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (code.length === 0 || code.length > 32) return null;
  return code;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// quotaAllowed boundaries.
ok(quotaAllowed(0, 5, false) === true, "free under limit allowed");
ok(quotaAllowed(4, 5, false) === true, "free one below limit allowed");
ok(quotaAllowed(5, 5, false) === false, "free at limit blocked");
ok(quotaAllowed(99, 5, false) === false, "free over limit blocked");
ok(quotaAllowed(99, 5, true) === true, "vip unlimited");
ok(quotaAllowed(10, 10, false) === false, "tutor at limit blocked");
ok(quotaAllowed(9, 10, false) === true, "tutor under limit allowed");

// extendVip math.
const now = new Date("2026-11-11T00:00:00.000Z");
ok(extendVip(null, now) === "2026-12-11T00:00:00.000Z", "fresh claim now+30d");
ok(extendVip("2026-11-01T00:00:00.000Z", now) === "2026-12-11T00:00:00.000Z", "expired restarts from now");
ok(extendVip("2026-12-01T00:00:00.000Z", now) === "2026-12-31T00:00:00.000Z", "active extends from current");
ok(extendVip("not-a-date", now) === "2026-12-11T00:00:00.000Z", "unparseable treated as none");
ok(extendVip("2026-11-11T00:00:00.000Z", now) === "2026-12-11T00:00:00.000Z", "expiring now restarts from now");

// normalizeCode rules.
ok(normalizeCode("  vip-abc ") === "VIP-ABC", "trim + uppercase");
ok(normalizeCode("VIP-ABC") === "VIP-ABC", "already canonical");
ok(normalizeCode("") === null, "empty rejected");
ok(normalizeCode("   ") === null, "whitespace rejected");
ok(normalizeCode("x".repeat(32)) === "X".repeat(32), "32 chars ok");
ok(normalizeCode("x".repeat(33)) === null, "33 chars rejected");
ok(normalizeCode(null) === null, "non-string rejected");
ok(normalizeCode(123) === null, "number rejected");

// Admin-create min-length rule: pure mirror of the codes-route zod min(8)
// plus the admin_create_code SQL guards. Both normalize first, so short
// codes padded with whitespace are still rejected (advisory-lock behavior
// can't be unit-tested offline — skipped by design).
function adminCodeValid(raw) {
  const code = normalizeCode(raw);
  return code !== null && code.length >= 8;
}
ok(adminCodeValid("VIP-ABCD") === true, "admin 8 chars ok");
ok(adminCodeValid("  vip-abc12 ") === true, "admin trim then 9 ok");
ok(adminCodeValid("SHORT") === false, "admin 5 chars rejected");
ok(adminCodeValid("1234567") === false, "admin 7 chars rejected");
ok(adminCodeValid("  1234567  ") === false, "admin 7 chars padded rejected");
ok(adminCodeValid("x".repeat(32)) === true, "admin 32 chars ok");
ok(adminCodeValid("x".repeat(33)) === false, "admin 33 chars rejected");
ok(adminCodeValid("") === false, "admin empty rejected");

console.log(`VIP TESTS OK: ${n} assertions`);

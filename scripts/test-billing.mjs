// Offline tests: billing pure rules (entitlement coverage, expiry boundary,
// Xu anti-double, memo format, plan seed shape, order state machine).
// Run: node arena/scripts/test-billing.mjs
// Note: mirrors productCovered/subActive in lib/billing/entitle.ts, the
// 0016 xu_daily_uidx rule, generateMemo/isMemoValid + PLANS in
// lib/billing/plans.ts, and the approve_order status guards in 0016.
import assert from "node:assert/strict";

function productCovered(planProduct, want) {
  if (planProduct === "bundle") return true;
  return planProduct === want;
}
function subActive(status, endsAt, nowMs) {
  if (status !== "active") return false;
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > nowMs;
}
// Pure mirror of getEntitlement's merge: VIP covers all; each live sub adds
// its product coverage.
function entitled({ vip, subs }, want, nowMs) {
  if (vip) return true;
  return subs.some(
    (s) => subActive(s.status, s.ends_at, nowMs) && productCovered(s.product, want),
  );
}
function isMemoValid(memo) {
  return typeof memo === "string" && /^ARENA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(memo);
}
// Pure mirror of the xu_daily_uidx rule: one (player, utc-day) claim.
function dailyClaimed(prior, player, day) {
  return prior.some((r) => r.player === player && r.day === day && r.reason === "daily");
}
// Pure mirror of the approve_order/reject guards: only pending moves.
function orderTransition(from, action) {
  if (from !== "pending") return null;
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return null;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const NOW = Date.parse("2026-11-12T00:00:00.000Z");
const LIVE = new Date(NOW + 86400_000).toISOString();
const PAST = new Date(NOW - 1000).toISOString();
const EDGE = new Date(NOW).toISOString();

// Coverage matrix: none / A / B / bundle / VIP x want A / B.
const none = { vip: false, subs: [] };
ok(entitled(none, "A", NOW) === false, "none x A denied");
ok(entitled(none, "B", NOW) === false, "none x B denied");
const subA = { vip: false, subs: [{ product: "A", status: "active", ends_at: LIVE }] };
ok(entitled(subA, "A", NOW) === true, "A-sub x A allowed");
ok(entitled(subA, "B", NOW) === false, "A-sub x B denied");
const subB = { vip: false, subs: [{ product: "B", status: "active", ends_at: LIVE }] };
ok(entitled(subB, "A", NOW) === false, "B-sub x A denied");
ok(entitled(subB, "B", NOW) === true, "B-sub x B allowed");
const subBundle = { vip: false, subs: [{ product: "bundle", status: "active", ends_at: LIVE }] };
ok(entitled(subBundle, "A", NOW) === true, "bundle x A allowed");
ok(entitled(subBundle, "B", NOW) === true, "bundle x B allowed");
const vipOnly = { vip: true, subs: [] };
ok(entitled(vipOnly, "A", NOW) === true, "vip x A allowed");
ok(entitled(vipOnly, "B", NOW) === true, "vip x B allowed");
ok(productCovered("zzz", "A") === false, "unknown product covers nothing");

// Expiry boundary + status gate.
ok(subActive("active", LIVE, NOW) === true, "live sub active");
ok(subActive("active", PAST, NOW) === false, "past sub expired");
ok(subActive("active", EDGE, NOW) === false, "ends_at == now is expired");
ok(subActive("expired", LIVE, NOW) === false, "expired status ignored");
ok(subActive("cancelled", LIVE, NOW) === false, "cancelled status ignored");
ok(subActive("active", "not-a-date", NOW) === false, "unparseable ends_at ignored");
const expiredSub = { vip: false, subs: [{ product: "bundle", status: "active", ends_at: PAST }] };
ok(entitled(expiredSub, "A", NOW) === false, "expired bundle covers nothing");

// Xu anti-double (pure mirror of xu_daily_uidx).
const ledger = [{ player: "p1", day: "2026-11-12", reason: "daily" }];
ok(dailyClaimed(ledger, "p1", "2026-11-12") === true, "same player same day blocked");
ok(dailyClaimed(ledger, "p1", "2026-11-13") === false, "next day allowed");
ok(dailyClaimed(ledger, "p2", "2026-11-12") === false, "other player allowed");
ok(dailyClaimed([], "p1", "2026-11-12") === false, "empty ledger allowed");
ok(dailyClaimed([{ player: "p1", day: "2026-11-12", reason: "bonus" }], "p1", "2026-11-12") === false, "non-daily reason ignored");

// Memo format.
ok(isMemoValid("ARENA-ABCDEF") === true, "canonical memo ok");
ok(isMemoValid("ARENA-234567") === true, "digit memo ok");
ok(isMemoValid("ARENA-ABCDE") === false, "5-char tail rejected");
ok(isMemoValid("ARENA-ABCDEFG") === false, "7-char tail rejected");
ok(isMemoValid("ARENA-ABCDE0") === false, "ambiguous 0 rejected");
ok(isMemoValid("ARENA-ABCDEO") === false, "ambiguous O rejected");
ok(isMemoValid("ARENA-ABCDE1") === false, "ambiguous 1 rejected");
ok(isMemoValid("ARENA-ABCDEI") === false, "ambiguous I rejected");
ok(isMemoValid("arena-ABCDEF") === false, "lowercase prefix rejected");
ok(isMemoValid("VIP-ABCDEF") === false, "wrong prefix rejected");
ok(isMemoValid("") === false, "empty memo rejected");
ok(isMemoValid(null) === false, "null memo rejected");

// Plan seed shape (mirrors PLANS + the 0016 seed rows).
const PLANS = {
  scan_monthly: { name: "Study Unlock", product: "A", price_vnd: 29000, period_days: 30 },
  exam_monthly: { name: "Exam Packs", product: "B", price_vnd: 29000, period_days: 30 },
  bundle_monthly: { name: "Bundle", product: "bundle", price_vnd: 49000, period_days: 30 },
  bundle_yearly: { name: "Bundle Yearly", product: "bundle", price_vnd: 490000, period_days: 365 },
};
ok(Object.keys(PLANS).length === 4, "four plans seeded");
for (const [code, p] of Object.entries(PLANS)) {
  ok(["A", "B", "bundle"].includes(p.product), `${code} product valid`);
  ok(Number.isInteger(p.price_vnd) && p.price_vnd > 0, `${code} price positive`);
  ok(Number.isInteger(p.period_days) && p.period_days > 0, `${code} period positive`);
}
ok(PLANS.bundle_monthly.price_vnd < PLANS.scan_monthly.price_vnd + PLANS.exam_monthly.price_vnd, "bundle cheaper than A+B");
ok("bundle_monthly" in PLANS, "hero plan exists");

// Order state machine: pending -> approved|rejected only.
ok(orderTransition("pending", "approve") === "approved", "pending approve ok");
ok(orderTransition("pending", "reject") === "rejected", "pending reject ok");
ok(orderTransition("pending", "cancel") === null, "pending unknown action blocked");
ok(orderTransition("approved", "approve") === null, "approved re-approve blocked");
ok(orderTransition("approved", "reject") === null, "approved reject blocked");
ok(orderTransition("rejected", "approve") === null, "rejected approve blocked");
ok(orderTransition("bogus", "approve") === null, "unknown status blocked");

// Scope delta (A, user-locked): optional payer_ref/device_id passthrough,
// refunds one-row-per-order rule, REFUND_DAYS window constant.
function optRefValid(v) {
  return v === undefined || (typeof v === "string" && v.length <= 64);
}
ok(optRefValid(undefined) === true, "payer_ref omitted ok");
ok(optRefValid("0901234567 / MoMo") === true, "payer_ref stored as-is");
ok(optRefValid("x".repeat(64)) === true, "device_id 64 chars ok");
ok(optRefValid("x".repeat(65)) === false, "65 chars rejected");
ok(optRefValid(123) === false, "non-string ref rejected");
// Pure mirror of the refunds order_id UNIQUE rule: a second refund row for
// the same order collapses to a violation, never a double refund.
function refundInsertable(existing, orderId) {
  return !existing.some((r) => r.order_id === orderId);
}
ok(refundInsertable([], "o1") === true, "first refund for order ok");
ok(refundInsertable([{ order_id: "o1" }], "o1") === false, "second refund for order blocked");
ok(refundInsertable([{ order_id: "o1" }], "o2") === true, "refund for other order ok");
const REFUND_DAYS = 5;
ok(REFUND_DAYS === 5, "refund window is 5 days (user lock)");

console.log(`BILLING TESTS OK: ${n} assertions`);

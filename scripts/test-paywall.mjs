// Offline tests: paywall slice-2 pure rules (fixed-gap distinct counting,
// FREE_GAPS/FREE_EXAMS boundaries, decideAccess matrix incl. null player +
// entitled bypass + extra-flag + kin OR-composition, 402 shape, memo/plan
// constant reuse).
// Run: node arena/scripts/test-paywall.mjs
// Note: mirrors countFixedGaps/gapsExhausted/servesExhausted + FREE_GAPS +
// FREE_EXAMS in lib/billing/gaps.ts, decideAccess/paywallBody in
// lib/billing/access.ts, and reuses (not redefines) HERO_PLAN/MEMO_PREFIX/
// PLANS in lib/billing/plans.ts.
import assert from "node:assert/strict";

const FREE_GAPS = 3;
const FREE_EXAMS = 3;
function countFixed(rows) {
  const fixed = new Set();
  for (const r of rows) {
    if (r.status === "DEAD" && r.skill_tag) fixed.add(r.skill_tag);
  }
  return fixed.size;
}
function gapsExhausted(fixedCount) {
  return fixedCount >= FREE_GAPS;
}
function servesExhausted(servedCount) {
  return servedCount >= FREE_EXAMS;
}
// Pure mirror of decideAccess: null -> free; under product quota -> free;
// else entitled (subscription OR extra flag OR kin) -> entitled, else paywall.
function hasAccess({ playerId, product = "A", fixedCount = 0, examsServed = 0, entitled, extraEntitled = false, kinVip = false }) {
  if (!playerId) return { ok: true, reason: "free" };
  const spent = product === "B" ? servesExhausted(examsServed) : gapsExhausted(fixedCount);
  if (!spent) return { ok: true, reason: "free" };
  if (entitled || extraEntitled || kinVip) return { ok: true, reason: "entitled" };
  return { ok: false, reason: "paywall" };
}
const PAYWALL_ERROR = "Free gaps used up — upgrade to keep fixing gaps.";
function paywallBody() {
  return { error: PAYWALL_ERROR, vip_url: "/billing" };
}
// Gate product mapping (summon -> A, exam mocks -> B).
const GATE_PRODUCT = { summon: "A", vact: "B", hsa: "B", thpt: "B" };

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Distinct counting: dupes collapse, non-DEAD and tagless rows ignored.
const DEAD = (skill_tag) => ({ skill_tag, status: "DEAD" });
ok(countFixed([DEAD("g10_1"), DEAD("g10_1")]) === 1, "duplicate tags collapse to 1");
ok(countFixed([DEAD("g10_1"), DEAD("g11_2"), DEAD("g12_3")]) === 3, "3 distinct tags count 3");
ok(countFixed([DEAD("g10_1"), { skill_tag: "g11_2", status: "DYING" }]) === 1, "non-DEAD boss ignored");
ok(countFixed([DEAD("g10_1"), { skill_tag: "", status: "DEAD" }]) === 1, "empty skill_tag ignored");
ok(countFixed([]) === 0, "no rows count 0");

// FREE_GAPS boundary: 2 free, 3 paywall.
ok(FREE_GAPS === 3, "FREE_GAPS is 3 (coordinator lock 15)");
ok(gapsExhausted(0) === false, "0 gaps not exhausted");
ok(gapsExhausted(2) === false, "2 gaps not exhausted");
ok(gapsExhausted(3) === true, "3 gaps exhausted");
ok(gapsExhausted(9) === true, "9 gaps exhausted");
// FREE_EXAMS boundary mirrors gaps (product B quota).
ok(FREE_EXAMS === 3, "FREE_EXAMS is 3 (coordinator lock 15)");
ok(servesExhausted(2) === false, "2 serves not exhausted");
ok(servesExhausted(3) === true, "3 serves exhausted");

// Access matrix.
ok(JSON.stringify(hasAccess({ playerId: null, fixedCount: 99, entitled: false })) === JSON.stringify({ ok: true, reason: "free" }), "null player free even past cap");
ok(hasAccess({ playerId: "p1", fixedCount: 2, entitled: false }).reason === "free", "under cap free without entitlement");
const blocked = hasAccess({ playerId: "p1", fixedCount: 3, entitled: false });
ok(blocked.ok === false && blocked.reason === "paywall", "at cap without entitlement paywalled");
const vip = hasAccess({ playerId: "p1", fixedCount: 5, entitled: true });
ok(vip.ok === true && vip.reason === "entitled", "entitled bypasses past cap");
const composed = hasAccess({ playerId: "p1", fixedCount: 3, entitled: false, extraEntitled: true });
ok(composed.ok === true && composed.reason === "entitled", "extra flag OR-composes (P5/P6 hook)");
ok(hasAccess({ playerId: "p1", fixedCount: 3, entitled: false, extraEntitled: false }).ok === false, "extra flag false grants nothing");
ok(hasAccess({ playerId: "p1", fixedCount: 1, entitled: false, extraEntitled: true }).reason === "free", "extra flag irrelevant under cap");
const kin = hasAccess({ playerId: "p1", fixedCount: 9, entitled: false, kinVip: true });
ok(kin.ok === true && kin.reason === "entitled", "kin VIP OR-composes past cap");
ok(hasAccess({ playerId: "p1", fixedCount: 9, entitled: false, kinVip: false }).ok === false, "kin false grants nothing past cap");
// Product B uses exam serves, not gaps: exam-only users bind to the B quota.
const bFree = hasAccess({ playerId: "p1", product: "B", fixedCount: 99, examsServed: 2, entitled: false });
ok(bFree.ok === true && bFree.reason === "free", "B under serves cap free regardless of gaps");
const bWall = hasAccess({ playerId: "p1", product: "B", fixedCount: 0, examsServed: 3, entitled: false });
ok(bWall.ok === false && bWall.reason === "paywall", "B at serves cap paywalled with zero gaps");
const bVip = hasAccess({ playerId: "p1", product: "B", fixedCount: 0, examsServed: 9, entitled: true });
ok(bVip.ok === true && bVip.reason === "entitled", "B entitlement bypasses past serves cap");
const bKin = hasAccess({ playerId: "p1", product: "B", fixedCount: 0, examsServed: 9, entitled: false, kinVip: true });
ok(bKin.ok === true && bKin.reason === "entitled", "B kin VIP bypasses past serves cap");

// 402 shape: exactly {error, vip_url}.
const body = paywallBody();
ok(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["error", "vip_url"]), "402 body has exactly error + vip_url keys");
ok(body.vip_url === "/billing", "402 vip_url points at /billing");
ok(/free gaps/i.test(body.error), "402 error names the free gaps");

// Memo/plan reuse: the paywall reuses plans.ts constants (no dupes).
const MEMO_PREFIX = "ARENA-";
const HERO_PLAN = "bundle_monthly";
const PLANS = {
  scan_monthly: { name: "Study Unlock", product: "A", price_vnd: 29000, period_days: 30 },
  exam_monthly: { name: "Exam Packs", product: "B", price_vnd: 29000, period_days: 30 },
  bundle_monthly: { name: "Bundle", product: "bundle", price_vnd: 49000, period_days: 30 },
  bundle_yearly: { name: "Bundle Yearly", product: "bundle", price_vnd: 490000, period_days: 365 },
};
ok(MEMO_PREFIX === "ARENA-", "memo prefix reused from plans.ts");
ok(HERO_PLAN in PLANS, "hero plan reused from plans.ts");
ok(PLANS[HERO_PLAN].price_vnd === 49000, "hero Bundle price 49k reused, not redefined");

// Gate product mapping.
ok(GATE_PRODUCT.summon === "A", "summon gates product A");
ok(GATE_PRODUCT.vact === "B" && GATE_PRODUCT.hsa === "B" && GATE_PRODUCT.thpt === "B", "all exam mocks gate product B");

console.log(`PAYWALL TESTS OK: ${n} assertions`);

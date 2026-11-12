// Offline tests: family pure rules (seat caps, join guards, parent-sub gate,
// family-VIP composition, link-code format, family plan seed shape).
// Run: node arena/scripts/test-family.mjs
// Note: mirrors seatsFor/canJoin/isFamilyVip + normalizeLinkCode in
// lib/family/family.ts, the FAMILY_SEATS map + family_2/family_4 rows in
// lib/billing/plans.ts, the 0017 seed rows, and the join/create/me route
// guards in app/api/family/*.
import assert from "node:assert/strict";

// --- Pure mirrors of lib/family/family.ts ---
const FAMILY_SEATS = { family_2: 2, family_4: 4 };
function seatsFor(planCode) {
  return FAMILY_SEATS[planCode] ?? 0;
}
function canJoin(memberCount, planCode) {
  if (!Number.isInteger(memberCount) || memberCount < 0) return false;
  return memberCount < seatsFor(planCode);
}
function isFamilyVip({ familyActive, parentSubActive }) {
  return familyActive === true && parentSubActive === true;
}
function normalizeLinkCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(code)) return null;
  return code;
}
function subActive(status, endsAt, nowMs) {
  if (status !== "active") return false;
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > nowMs;
}
// Pure mirror of the create gate (parentHasFamilySub): a LIVE family-plan
// subscription specifically — plain bundle_monthly does not unlock creation.
const FAMILY_CODES = ["family_2", "family_4"];
function creationAllowed(subs, nowMs) {
  return subs.some(
    (s) => FAMILY_CODES.includes(s.plan_code) && subActive(s.status, s.ends_at, nowMs),
  );
}
// Pure mirror of the join route guards, in route order: shape -> dup child ->
// active family -> self code -> LIVE parent sub -> seats from the LIVE plan
// (a downgraded/lapsed parent admits none past the live cap). Returns the
// route status on success or the failure reason.
function joinDecision({ code, alreadyMember, family, selfCode, used, livePlanCode }) {
  if (!normalizeLinkCode(code)) return "bad-code";
  if (alreadyMember) return "dup-child";
  if (!family) return "unknown-code";
  if (family.status !== "active") return "family-inactive";
  if (selfCode) return "self-code";
  if (!livePlanCode) return "family-inactive";
  if (!canJoin(used, livePlanCode)) return "full";
  return "joined";
}
// Pure mirror of VIP composition: kid VIP = own VIP/sub OR family-VIP.
function kidVip({ ownVip, familyVip }) {
  return ownVip === true || familyVip === true;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const NOW = Date.parse("2026-11-12T00:00:00.000Z");
const LIVE = new Date(NOW + 86400_000).toISOString();
const PAST = new Date(NOW - 1000).toISOString();

// Seats matrix: both plans x under/at/over cap + unknown plan.
ok(seatsFor("family_2") === 2, "family_2 seats 2");
ok(seatsFor("family_4") === 4, "family_4 seats 4");
ok(seatsFor("bundle_monthly") === 0, "non-family plan seats 0 (fail-closed)");
ok(seatsFor("bogus") === 0, "unknown plan seats 0 (fail-closed)");
ok(canJoin(0, "family_2") === true, "0/2 joins");
ok(canJoin(1, "family_2") === true, "1/2 joins");
ok(canJoin(2, "family_2") === false, "2/2 full");
ok(canJoin(3, "family_2") === false, "3/2 over cap blocked");
ok(canJoin(3, "family_4") === true, "3/4 joins");
ok(canJoin(4, "family_4") === false, "4/4 full");
ok(canJoin(0, "bundle_monthly") === false, "0 seats never joins");
ok(canJoin(-1, "family_2") === false, "negative count blocked");
ok(canJoin(1.5, "family_2") === false, "fractional count blocked");

// Join rules (route-guard order).
const fam2 = { status: "active", plan_code: "family_2" };
const base = { code: "ABCDEFGH", alreadyMember: false, family: fam2, selfCode: false, used: 1, livePlanCode: "family_2" };
ok(joinDecision(base) === "joined", "happy path joins");
ok(joinDecision({ ...base, code: "ABC" }) === "bad-code", "short code rejected");
ok(joinDecision({ ...base, code: "ABCDEFG0" }) === "bad-code", "look-alike 0 rejected");
ok(joinDecision({ ...base, code: "abcdefjh" }) === "joined", "lowercase normalized");
ok(joinDecision({ ...base, code: "  ABCDEFGH " }) === "joined", "surrounding spaces trimmed");
ok(joinDecision({ ...base, code: null }) === "bad-code", "null code rejected");
ok(joinDecision({ ...base, alreadyMember: true }) === "dup-child", "dup child blocked");
ok(joinDecision({ ...base, alreadyMember: true, code: "bad" }) === "bad-code", "shape checked before dup");
ok(joinDecision({ ...base, family: null }) === "unknown-code", "unknown code 404");
ok(joinDecision({ ...base, family: { ...fam2, status: "expired" } }) === "family-inactive", "expired family blocked");
ok(joinDecision({ ...base, family: { ...fam2, status: "cancelled" } }) === "family-inactive", "cancelled family blocked");
ok(joinDecision({ ...base, selfCode: true }) === "self-code", "own code blocked");
ok(joinDecision({ ...base, used: 2 }) === "full", "full family 409");
ok(joinDecision({ ...base, alreadyMember: true, used: 2 }) === "dup-child", "dup checked before seats");
ok(joinDecision({ ...base, livePlanCode: null }) === "family-inactive", "lapsed parent sub admits none");
ok(joinDecision({ ...base, used: 2, livePlanCode: "family_4" }) === "joined", "live plan seats used, not stored");
ok(joinDecision({ ...base, used: 1, livePlanCode: "family_2" }) === "joined", "downgraded family keeps live cap");
ok(joinDecision({ ...base, family: { status: "active", plan_code: "family_4" }, used: 2, livePlanCode: "family_2" }) === "full", "stored plan ignored after downgrade");

// Parent-sub gate (creation): live family sub required.
ok(creationAllowed([{ plan_code: "family_2", status: "active", ends_at: LIVE }], NOW) === true, "live family_2 creates");
ok(creationAllowed([{ plan_code: "family_4", status: "active", ends_at: LIVE }], NOW) === true, "live family_4 creates");
ok(creationAllowed([], NOW) === false, "no sub -> 402");
ok(creationAllowed([{ plan_code: "bundle_monthly", status: "active", ends_at: LIVE }], NOW) === false, "plain bundle cannot create");
ok(creationAllowed([{ plan_code: "family_2", status: "active", ends_at: PAST }], NOW) === false, "expired family sub -> 402");
ok(creationAllowed([{ plan_code: "family_2", status: "cancelled", ends_at: LIVE }], NOW) === false, "cancelled family sub -> 402");
ok(
  creationAllowed(
    [
      { plan_code: "family_2", status: "active", ends_at: PAST },
      { plan_code: "family_4", status: "active", ends_at: LIVE },
    ],
    NOW,
  ) === true,
  "one live family sub among lapsed creates",
);

// Family-VIP composition: active row AND live parent sub; kid VIP = own OR family.
ok(isFamilyVip({ familyActive: true, parentSubActive: true }) === true, "active row + live sub is family-VIP");
ok(isFamilyVip({ familyActive: true, parentSubActive: false }) === false, "lapsed parent sub grants nothing");
ok(isFamilyVip({ familyActive: false, parentSubActive: true }) === false, "inactive row grants nothing");
ok(isFamilyVip({ familyActive: false, parentSubActive: false }) === false, "neither grants nothing");
ok(kidVip({ ownVip: false, familyVip: true }) === true, "family OR sub: family leg");
ok(kidVip({ ownVip: true, familyVip: false }) === true, "family OR sub: own leg");
ok(kidVip({ ownVip: true, familyVip: true }) === true, "family OR sub: both");
ok(kidVip({ ownVip: false, familyVip: false }) === false, "family OR sub: neither");

// Link-code format.
ok(normalizeLinkCode("ABCDEFGH") === "ABCDEFGH", "canonical code ok");
ok(normalizeLinkCode("23456789") === "23456789", "digit code ok");
ok(normalizeLinkCode("abcdefjh") === "ABCDEFJH", "lowercase uppercased");
ok(normalizeLinkCode("ABCDEFG") === null, "7 chars rejected");
ok(normalizeLinkCode("ABCDEFGHI") === null, "9 chars rejected");
ok(normalizeLinkCode("ABCDEFG0") === null, "ambiguous 0 rejected");
ok(normalizeLinkCode("ABCDEFGO") === null, "ambiguous O rejected");
ok(normalizeLinkCode("ABCDEFG1") === null, "ambiguous 1 rejected");
ok(normalizeLinkCode("ABCDEFGI") === null, "ambiguous I rejected");
ok(normalizeLinkCode("ABCDEFG ") === null, "7 chars + space rejected");
ok(normalizeLinkCode("") === null, "empty code rejected");
ok(normalizeLinkCode(12345678) === null, "non-string code rejected");

// Family plan seed shape (mirrors PLANS + the 0017 seed rows; coordinator
// locks: 79k/2-kids + 119k/4-kids).
const PLANS = {
  family_2: { name: "Family 2 kids", product: "bundle", price_vnd: 79000, period_days: 30 },
  family_4: { name: "Family 4 kids", product: "bundle", price_vnd: 119000, period_days: 30 },
};
ok(PLANS.family_2.price_vnd === 79000, "family_2 is 79k (lock)");
ok(PLANS.family_4.price_vnd === 119000, "family_4 is 119k (lock)");
ok(PLANS.family_4.price_vnd < PLANS.family_2.price_vnd * 2, "family_4 cheaper than 2x family_2");
for (const [code, p] of Object.entries(PLANS)) {
  ok(p.product === "bundle", `${code} product is bundle`);
  ok(p.period_days === 30, `${code} period is 30 days`);
  ok(FAMILY_SEATS[code] > 0, `${code} has seats`);
}

console.log(`FAMILY TESTS OK: ${n} assertions`);

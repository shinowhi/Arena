// Offline tests: center pure rules (enrollment-VIP matrix, seat caps,
// teacher-only assignment, join-code format, assignment shape, class status
// machine, tier seed constants).
// Run: node arena/scripts/test-center.mjs
// Note: mirrors hasEnrollmentVip/isTeacher + CLASS_TIERS + normalizeJoinCode
// in lib/center/center.ts, the join/create/assignment route guards, and the
// set_class_status RPC guards in 0018.
import assert from "node:assert/strict";

// Pure mirror of hasEnrollmentVip: VIP ONLY on >=1 active enrollment in an
// ACTIVE class — no purchase path, no other grant.
function enrollmentVip(enrollments, classStatus) {
  return enrollments.some((e) => e.active === true && classStatus(e.class_id) === "active");
}
// Pure mirror of the join route guards: active class, free seat, no row yet.
function joinDecision({ status, seats, enrolled, existing }) {
  if (status !== "active") return "class_inactive";
  if (existing === "active") return "already_enrolled";
  if (existing === "inactive") return "deactivated";
  if (enrolled >= seats) return "full";
  return "ok";
}
// Pure mirror of the assignment route guards: teacher-only, known skill,
// non-empty title, ISO-or-null due.
function assignDecision({ teacher, skillKnown, title, dueMs }) {
  if (!teacher) return "forbidden";
  if (!skillKnown) return "bad_skill";
  if (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 120) {
    return "bad_title";
  }
  if (dueMs !== null && !Number.isFinite(dueMs)) return "bad_due";
  return "ok";
}
function normalizeJoinCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!/^CENTER-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) return null;
  return code;
}
// Pure mirror of the set_class_status RPC guards: status must be known, the
// class must exist; any known status may be set from any current status.
function setClassStatus(current, next, exists) {
  if (next !== "pending" && next !== "active" && next !== "expired" && next !== "cancelled") return "class_bad_status";
  if (!exists) return "class_not_found";
  if (current === next) return next;
  return next;
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Enrollment-VIP matrix: active/inactive enrollment x active/expired class.
const activeClass = () => "active";
const expiredClass = () => "expired";
const cancelledClass = () => "cancelled";
ok(enrollmentVip([], activeClass) === false, "no enrollments -> no vip");
ok(enrollmentVip([{ class_id: "c1", active: true }], activeClass) === true, "active enrollment in active class -> vip");
ok(enrollmentVip([{ class_id: "c1", active: true }], expiredClass) === false, "active enrollment in expired class -> no vip");
ok(enrollmentVip([{ class_id: "c1", active: true }], cancelledClass) === false, "active enrollment in cancelled class -> no vip");
ok(enrollmentVip([{ class_id: "c1", active: false }], activeClass) === false, "inactive enrollment in active class -> no vip");
ok(enrollmentVip([{ class_id: "c1", active: false }], expiredClass) === false, "inactive x expired -> no vip");
const mixed = [
  { class_id: "c1", active: false },
  { class_id: "c2", active: true },
];
ok(enrollmentVip(mixed, (id) => (id === "c2" ? "active" : "expired")) === true, "one live enrollment among dead ones -> vip");
ok(enrollmentVip(mixed, () => "expired") === false, "live enrollment but every class expired -> no vip");

// Seat caps + join guards.
const OPEN = { status: "active", seats: 30, enrolled: 0, existing: null };
ok(joinDecision(OPEN) === "ok", "empty active class joins");
ok(joinDecision({ ...OPEN, enrolled: 29 }) === "ok", "last seat joins");
ok(joinDecision({ ...OPEN, enrolled: 30 }) === "full", "full class rejects");
ok(joinDecision({ ...OPEN, enrolled: 31 }) === "full", "overfilled class rejects");
ok(joinDecision({ ...OPEN, existing: "active" }) === "already_enrolled", "double join blocked");
ok(joinDecision({ ...OPEN, existing: "inactive" }) === "deactivated", "deactivated row cannot rejoin");
ok(joinDecision({ ...OPEN, status: "expired" }) === "class_inactive", "expired class rejects joins");
ok(joinDecision({ ...OPEN, status: "cancelled" }) === "class_inactive", "cancelled class rejects joins");
ok(joinDecision({ ...OPEN, seats: 20, enrolled: 20 }) === "full", "20-seat tier cap enforced");
ok(joinDecision({ ...OPEN, seats: 50, enrolled: 49 }) === "ok", "50-seat tier admits 50th");

// Teacher-only assignment + shape.
const GOOD = { teacher: true, skillKnown: true, title: "Fractions set 1", dueMs: Date.parse("2026-12-01T00:00:00.000Z") };
ok(assignDecision(GOOD) === "ok", "teacher posts valid assignment");
ok(assignDecision({ ...GOOD, dueMs: null }) === "ok", "null due date ok");
ok(assignDecision({ ...GOOD, teacher: false }) === "forbidden", "non-teacher denied");
ok(assignDecision({ ...GOOD, skillKnown: false }) === "bad_skill", "unknown skill rejected");
ok(assignDecision({ ...GOOD, title: "  " }) === "bad_title", "blank title rejected");
ok(assignDecision({ ...GOOD, title: "x".repeat(121) }) === "bad_title", "121-char title rejected");
ok(assignDecision({ ...GOOD, title: "x".repeat(120) }) === "ok", "120-char title ok");
ok(assignDecision({ ...GOOD, title: 123 }) === "bad_title", "non-string title rejected");
ok(assignDecision({ ...GOOD, dueMs: NaN }) === "bad_due", "unparseable due rejected");

// Join-code format (mirrors normalizeJoinCode).
ok(normalizeJoinCode("CENTER-ABCDEF") === "CENTER-ABCDEF", "canonical code ok");
ok(normalizeJoinCode("  center-234567 ") === "CENTER-234567", "lowercase + padding canonicalized");
ok(normalizeJoinCode("CENTER-ABCDE") === null, "5-char tail rejected");
ok(normalizeJoinCode("CENTER-ABCDEFG") === null, "7-char tail rejected");
ok(normalizeJoinCode("CENTER-ABCDE0") === null, "ambiguous 0 rejected");
ok(normalizeJoinCode("CENTER-ABCDEO") === null, "ambiguous O rejected");
ok(normalizeJoinCode("CENTER-ABCDE1") === null, "ambiguous 1 rejected");
ok(normalizeJoinCode("CENTER-ABCDEI") === null, "ambiguous I rejected");
ok(normalizeJoinCode("ARENA-ABCDEF") === null, "order memo prefix rejected");
ok(normalizeJoinCode("") === null, "empty code rejected");
ok(normalizeJoinCode(null) === null, "null code rejected");
ok(normalizeJoinCode("CENTER-abcdef") === "CENTER-ABCDEF", "lowercase tail uppercased");

// Tier seed shape (mirrors CLASS_TIERS + the 0018 seed rows).
const CLASS_TIERS = {
  class_20: { seats: 20, price_vnd: 780000, period_days: 30, hero: false },
  class_30: { seats: 30, price_vnd: 999000, period_days: 30, hero: true },
  class_50: { seats: 50, price_vnd: 1490000, period_days: 30, hero: false },
};
ok(Object.keys(CLASS_TIERS).length === 3, "three tiers seeded");
for (const [code, t] of Object.entries(CLASS_TIERS)) {
  ok(Number.isInteger(t.seats) && t.seats > 0, `${code} seats positive`);
  ok(Number.isInteger(t.price_vnd) && t.price_vnd > 0, `${code} price positive`);
  ok(t.period_days === 30, `${code} period is 30 days`);
}
ok(CLASS_TIERS.class_20.price_vnd === 780000, "class_20 price 780k");
ok(CLASS_TIERS.class_30.price_vnd === 999000, "class_30 price 999k");
ok(CLASS_TIERS.class_50.price_vnd === 1490000, "class_50 price 1.49M");
ok(Object.values(CLASS_TIERS).filter((t) => t.hero).length === 1, "exactly one hero tier");
ok(CLASS_TIERS.class_30.hero === true, "class_30 is the hero tier");
ok(
  CLASS_TIERS.class_20.price_vnd < CLASS_TIERS.class_30.price_vnd &&
    CLASS_TIERS.class_30.price_vnd < CLASS_TIERS.class_50.price_vnd,
  "tier prices ascend with seats",
);

// RPC status machine: any known status settable, unknown rejected, missing 404.
ok(setClassStatus("active", "expired", true) === "expired", "admin deactivates unpaid class");
ok(setClassStatus("expired", "active", true) === "active", "admin re-opens paid class");
ok(setClassStatus("active", "cancelled", true) === "cancelled", "cancel from active ok");
ok(setClassStatus("cancelled", "active", true) === "active", "re-open from cancelled ok");
ok(setClassStatus("active", "active", true) === "active", "no-op set returns status");
ok(setClassStatus("pending", "active", true) === "active", "admin activates paid pending class");
ok(setClassStatus("active", "weird", true) === "class_bad_status", "unknown status rejected");
ok(setClassStatus("active", "", true) === "class_bad_status", "empty status rejected");
ok(setClassStatus("active", "expired", false) === "class_not_found", "missing class 404s");

console.log(`CENTER TESTS OK: ${n} assertions`);

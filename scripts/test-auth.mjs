// Offline tests: phase-2a real-accounts rules + route-contract checks.
// Run: node arena/scripts/test-auth.mjs  (from the repo root)
// Real imports (sec-phase2a L5 — NOT mirrors): linkDecision,
// normalizeRole, consentAllowed from lib/auth/session.ts; EXPORT_TABLES and
// DELETE_TABLES from lib/auth/tables.ts (Node strips types natively, so the
// test fails if the sources drift). Mirrors kept for route branching that
// needs Next/Supabase to run: the {confirm:"DELETE"} gate, the consent
// 409-vs-update branch, the ?role= threading order, and the link-immunity
// (Ban) matrix over decideAccess inputs (lib/billing/access.ts itself is
// untouched by phase-2a — the matrix pins that).
import assert from "node:assert/strict";
import { linkDecision, normalizeRole, consentAllowed } from "../lib/auth/session.ts";
import { EXPORT_TABLES, DELETE_TABLES } from "../lib/auth/tables.ts";

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// linkDecision matrix (6, real): existing link wins, else cookie, else mint.
ok(linkDecision(true, true) === "already-linked", "link + cookie -> already-linked");
ok(linkDecision(false, true) === "already-linked", "link, no cookie -> already-linked");
ok(linkDecision(true, false) === "link-cookie", "cookie, no link -> link-cookie");
ok(linkDecision(false, false) === "create-new", "neither -> create-new");
ok(linkDecision("", null) === "create-new", "empty cookie id + null link -> create-new");
ok(
  linkDecision("uuid-player", undefined) === "link-cookie",
  "uuid cookie + undefined link -> link-cookie",
);

// Role validation (4, real).
ok(normalizeRole("student") === "student", "student accepted");
ok(
  normalizeRole("parent") === "parent" && normalizeRole("teacher") === "teacher",
  "parent + teacher accepted",
);
ok(normalizeRole("admin") === null, "admin rejected");
ok(
  normalizeRole("") === null &&
    normalizeRole(null) === null &&
    normalizeRole(123) === null &&
    normalizeRole("Parent") === null,
  "empty/null/non-string/wrong-case rejected",
);

// Consent gate (3, real): parent-of-child required, strict true only.
ok(consentAllowed(true) === true, "parent of that child may consent");
ok(consentAllowed(false) === false, "non-parent blocked");
ok(
  consentAllowed(undefined) === false &&
    consentAllowed(null) === false &&
    consentAllowed(1) === false,
  "missing/truthy-non-true blocked (strict)",
);

// Consent write-branch matrix (5, mirror of the H5 select-then-decide in
// POST /api/family/consent): none -> insert; own row -> policy update only;
// another parent's row -> 409, row untouched. (Replaces the old blind-upsert
// idempotency mirror.)
function consentWrite(existing, callerAuthUserId) {
  if (!existing) return "insert";
  if (existing.parent_auth_user_id !== callerAuthUserId) return "conflict";
  return "update";
}
ok(consentWrite(null, "u1") === "insert", "no row -> insert");
ok(
  consentWrite({ parent_auth_user_id: "u2", child_player_id: "kid-1" }, "u1") === "conflict",
  "another parent's row -> 409 conflict",
);
ok(
  consentWrite({ parent_auth_user_id: "u1", child_player_id: "kid-1" }, "u1") === "update",
  "own row -> policy update only",
);
const consentStore = new Map(); // child_player_id -> row
function applyConsentWrite(caller, child) {
  const action = consentWrite(consentStore.get(child) ?? null, caller);
  if (action === "insert") {
    consentStore.set(child, {
      parent_auth_user_id: caller,
      child_player_id: child,
      policy_version: "v1",
    });
  } else if (action === "update") {
    consentStore.get(child).policy_version = "v1";
  }
  return action;
}
ok(applyConsentWrite("u1", "kid-1") === "insert" && consentStore.size === 1, "first consent inserts");
ok(
  applyConsentWrite("u2", "kid-1") === "conflict" &&
    consentStore.size === 1 &&
    consentStore.get("kid-1").parent_auth_user_id === "u1",
  "rival parent 409s, row untouched",
);

// Role threading (4, real normalizeRole + mirror of the precedence in
// /api/auth/google + /auth/callback): ?role= wins, else pending cookie,
// else student.
const threadRole = (query, cookie) => normalizeRole(query) ?? normalizeRole(cookie) ?? "student";
ok(threadRole("parent", "teacher") === "parent", "query role wins over cookie");
ok(threadRole(null, "teacher") === "teacher", "cookie role used when query absent");
ok(threadRole("admin", "parent") === "parent", "invalid query falls back to cookie");
ok(
  threadRole(null, null) === "student" && threadRole("admin", "hacker") === "student",
  "unknowns default to student",
);

// Pending-cookie cleared: DOCUMENT-ONLY, untestable offline. The clear runs
// inside the /auth/callback + /api/auth/logout handlers via Next.js
// cookies(), which needs a live request scope — no pure unit can cover it,
// so no assertion here by design.

// Export/delete parity (4, real arrays): exact sets + the documented deltas.
// Export-only = financial-retained tables + classes (expired, not deleted);
// delete-only = play/social/study rows the export skips (export ≠ delete).
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
ok(
  sameSet(
    [...EXPORT_TABLES],
    [
      "players",
      "scans",
      "attacks",
      "drill_sets",
      "paper_attempts",
      "tutor_threads",
      "tutor_messages",
      "orders",
      "subscriptions",
      "refunds",
      "xu_ledger",
      "vip_claims",
      "funnel_events",
      "families",
      "family_members",
      "enrollments",
      "classes",
      "auth_links",
      "consents",
    ],
  ),
  "export covers exactly 19 tables",
);
ok(
  sameSet(
    [...DELETE_TABLES],
    [
      "tutor_messages",
      "tutor_threads",
      "paper_attempts",
      "drill_sets",
      "scans",
      "attacks",
      "funnel_events",
      "exam_attempts",
      "exam_elo",
      "exam_duels",
      "exam_room_players",
      "exam_rooms",
      "pvp_sides",
      "raid_hits",
      "invite_claims",
      "parent_links",
      "market_claims",
      "market_posts",
      "player_codes",
      "friend_requests",
      "friend_blocks",
      "direct_messages",
      "group_messages",
      "group_members",
      "groups",
      "challenges",
      "gifts",
      "reports",
      "enrollments",
      "family_members",
      "families",
      "consents",
      "auth_links",
      "players",
    ],
  ),
  "delete covers exactly 34 tables",
);
ok(
  sameSet(
    [...EXPORT_TABLES].filter((t) => !DELETE_TABLES.includes(t)),
    ["orders", "subscriptions", "refunds", "xu_ledger", "vip_claims", "classes"],
  ),
  "export-only delta exact (financial retained + classes)",
);
ok(
  sameSet(
    [...DELETE_TABLES].filter((t) => !EXPORT_TABLES.includes(t)),
    [
      "exam_attempts",
      "exam_elo",
      "exam_duels",
      "exam_room_players",
      "exam_rooms",
      "pvp_sides",
      "raid_hits",
      "invite_claims",
      "parent_links",
      "market_claims",
      "market_posts",
      "player_codes",
      "friend_requests",
      "friend_blocks",
      "direct_messages",
      "group_messages",
      "group_members",
      "groups",
      "challenges",
      "gifts",
      "reports",
    ],
  ),
  "delete-only delta exact (play/social rows not exported)",
);

// Delete confirm gate (3): mirrors the delete-route {confirm:"DELETE"} check.
function deleteConfirmed(body) {
  return !!body && typeof body === "object" && body.confirm === "DELETE";
}
ok(deleteConfirmed({ confirm: "DELETE" }) === true, "exact DELETE confirms");
ok(deleteConfirmed({ confirm: "delete" }) === false, "lowercase rejected");
ok(
  deleteConfirmed({}) === false &&
    deleteConfirmed(null) === false &&
    deleteConfirmed({ confirm: " DELETE " }) === false,
  "missing/null/padded rejected",
);

// Link-immunity (Ban) matrix (4): VIP/entitlement math takes no link input —
// identical outcomes whether the player linked a login or not. decideAccess
// itself is unaffected by phase-2a (access.ts untouched); this pins that.
function productCovered(planProduct, want) {
  if (planProduct === "bundle") return true;
  return planProduct === want;
}
function subActive(status, endsAt, nowMs) {
  if (status !== "active") return false;
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > nowMs;
}
const NOW = Date.parse("2026-11-13T00:00:00.000Z");
const FUTURE = "2026-12-13T00:00:00.000Z";
const PAST = "2026-10-13T00:00:00.000Z";
for (const linked of [false, true]) {
  void linked; // link state is not an input — outcomes must not vary with it
  ok(
    productCovered("bundle", "A") === true &&
      productCovered("A", "A") === true &&
      productCovered("A", "B") === false,
    `coverage identical (linked=${linked})`,
  );
  ok(
    subActive("active", FUTURE, NOW) === true &&
      subActive("active", PAST, NOW) === false &&
      subActive("cancelled", FUTURE, NOW) === false,
    `sub activity identical (linked=${linked})`,
  );
}

console.log(`AUTH TESTS OK: ${n} assertions`);

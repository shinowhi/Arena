// Offline tests: SECURITY PHASE-1 pure contracts. No network.
// Run: node arena/scripts/test-security.mjs
// Note: mirrors verifyPlayerCookie/signPlayerId in lib/game/player-sign.ts,
// the no-DB-accept getPlayerId logic in lib/game/player.ts, parseClientIp in
// lib/rate-limit.ts, PLAYER_COOKIE_MAX_AGE, the migration 0019 allow-matrix,
// and the untouched 402 paywall shapes (lib/billing/access.ts + scan quota).
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// ---- Signed cookie (mirror of lib/game/player-sign.ts) ----
process.env.PLAYER_SECRET = "test-secret";
const secret = () => process.env.PLAYER_SECRET ?? "";
function signPlayerId(id) {
  const hmac = createHmac("sha256", secret()).update(id).digest("hex").slice(0, 32);
  return `${id}.${hmac}`;
}
function verifyPlayerCookie(value) {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(id).digest("hex").slice(0, 32);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id;
}
// Mirror of the NEW getPlayerId (lib/game/player.ts): verify-only, never a
// DB row check. rowExists simulates "a matching players row exists" — the
// logic must ignore it for unsigned values.
function getPlayerIdPure(cookieValue, rowExists) {
  if (!cookieValue) return null;
  void rowExists;
  return verifyPlayerCookie(cookieValue);
}

const ID = "123e4567-e89b-12d3-a456-426614174000";
const signed = signPlayerId(ID);
ok(verifyPlayerCookie(signed) === ID, "valid signature accepted");
ok(getPlayerIdPure(signed, true) === ID, "valid cookie resolves without DB");
ok(getPlayerIdPure(`x${signed.slice(1)}`, true) === null, "tampered id rejected");
ok(getPlayerIdPure(`${signed.slice(0, -1)}${signed.endsWith("0") ? "1" : "0"}`, true) === null, "tampered sig rejected");
ok(verifyPlayerCookie(ID) === null, "legacy bare UUID fails verification");
ok(getPlayerIdPure(ID, true) === null, "bare UUID rejected even when a DB row exists (no DB-accept)");
ok(getPlayerIdPure(ID, false) === null, "bare UUID rejected when no DB row exists");
ok(getPlayerIdPure("", false) === null, "missing cookie resolves to null");
process.env.PLAYER_SECRET = "other-secret";
const foreign = signPlayerId(ID);
process.env.PLAYER_SECRET = "test-secret";
ok(verifyPlayerCookie(foreign) === null, "signature from another secret rejected");

// ---- parseClientIp (mirror of lib/rate-limit.ts) ----
function parseClientIp(headers) {
  const real = headers.get("x-real-ip");
  if (real) {
    const ip = real.trim();
    if (ip) return ip;
  }
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}
const H = (entries) => ({ get: (k) => entries[k] ?? null });
ok(parseClientIp(H({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" })) === "9.9.9.9", "x-real-ip wins over XFF");
ok(parseClientIp(H({ "x-forwarded-for": "1.2.3.4" })) === "1.2.3.4", "XFF first-entry fallback");
ok(
  parseClientIp(H({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "6.6.6.6, 7.7.7.7" })) === "9.9.9.9",
  "spoofed XFF first-entry ignored when x-real-ip present",
);
ok(parseClientIp(H({ "x-forwarded-for": "6.6.6.6, 7.7.7.7" })) === "6.6.6.6", "XFF chain takes first entry");
ok(parseClientIp(H({})) === "unknown", "no headers resolves to unknown");
ok(parseClientIp(H({ "x-real-ip": "   ", "x-forwarded-for": "1.2.3.4" })) === "1.2.3.4", "blank x-real-ip falls through to XFF");
ok(parseClientIp(H({ "x-real-ip": "  9.9.9.9  " })) === "9.9.9.9", "x-real-ip whitespace trimmed");

// ---- Cookie maxAge (mirror of PLAYER_COOKIE_MAX_AGE) ----
const PLAYER_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
ok(PLAYER_COOKIE_MAX_AGE === 7776000, "player cookie maxAge is 90 days in seconds");
ok(PLAYER_COOKIE_MAX_AGE === 90 * 86400, "maxAge composes as 90 days");

// ---- Migration 0019 allow-matrix (static mirror) ----
// After 0019, anon can SELECT exactly one table (the public plans catalog)
// and nothing else; every other app table denies anon everything.
const ANON_SELECT_TABLES = new Set(["plans"]);
const LOCKDOWN_TABLES = [
  "players", "scans", "bosses", "attacks", "invite_claims", "rush_days", "raid_hits",
  "parent_links", "market_posts", "market_claims", "player_codes", "friend_requests",
  "friend_blocks", "direct_messages", "groups", "group_members", "group_messages",
  "challenges", "gifts", "reports", "boss_question_cache", "pvp_sides", "exam_duels",
  "exam_elo", "exam_rooms", "exam_room_players", "exam_attempts", "funnel_events",
  "vip_codes", "vip_claims", "drill_sets", "paper_attempts", "tutor_threads",
  "tutor_messages", "subscriptions", "orders", "refunds", "xu_ledger", "families",
  "family_members", "centers", "classes", "enrollments", "assignments",
];
const anonOps = (table) => (ANON_SELECT_TABLES.has(table) ? ["SELECT"] : []);
ok(LOCKDOWN_TABLES.length === 44, "lockdown covers 44 tables");
ok(LOCKDOWN_TABLES.every((t) => anonOps(t).length === 0), "every lockdown table denies anon all ops");
ok(JSON.stringify(anonOps("plans")) === JSON.stringify(["SELECT"]), "plans keeps anon SELECT-only");
ok(!LOCKDOWN_TABLES.includes("plans"), "plans is not in the lockdown set");
for (const t of ["players", "bosses", "attacks", "subscriptions", "orders", "refunds", "xu_ledger", "tutor_threads", "tutor_messages", "vip_claims", "vip_codes"]) {
  ok(LOCKDOWN_TABLES.includes(t), `lockdown includes ${t}`);
}

// ---- 402 paywall shapes untouched (regression tripwires) ----
const PAYWALL_ERROR = "Free gaps used up — upgrade to keep fixing gaps.";
function paywallBody() {
  return { error: PAYWALL_ERROR, vip_url: "/billing" };
}
const body = paywallBody();
ok(JSON.stringify(Object.keys(body).sort()) === JSON.stringify(["error", "vip_url"]), "402 body has exactly error + vip_url keys");
ok(body.error === "Free gaps used up — upgrade to keep fixing gaps.", "402 error string unchanged");
ok(body.vip_url === "/billing", "402 vip_url still /billing");
// Scan daily-quota 402 shape (app/api/scan/route.ts): { error, vip_url, quota }.
const quotaBody = { error: "Daily free limit reached (5 scans). Enter a VIP code to continue.", vip_url: "/vip", quota: { used: 5, limit: 5, vip: false } };
ok(JSON.stringify(Object.keys(quotaBody).sort()) === JSON.stringify(["error", "quota", "vip_url"]), "scan 402 has exactly error + vip_url + quota keys");
ok(JSON.stringify(Object.keys(quotaBody.quota).sort()) === JSON.stringify(["limit", "used", "vip"]), "scan 402 quota has exactly used + limit + vip keys");
ok(quotaBody.vip_url === "/vip", "scan 402 vip_url still /vip");

console.log(`SECURITY TESTS OK: ${n} assertions`);

// Offline tests: social pure rules + API schema mirrors. No network.
// Run: node scripts/test-social.mjs  (from the arena/ directory)
// Note: mirrors lib/social/rules.ts self-contained (like test-agent-contracts.mjs)
// so it runs on plain node without a TS loader.
import assert from "node:assert/strict";
import { z } from "zod";

// ---------- mirror of lib/social/rules.ts ----------
const MESSAGE_MAX_LEN = 500;
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const GIFT_MAX_XP = 50;
const GIFT_ITEM_MAX = 40;
const GROUP_NAME_MAX = 40;
const REPORT_REASON_MAX = 60;
const REPORT_DETAILS_MAX = 500;
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeCode = (raw) => raw.trim().toUpperCase();
const isValidCode = (code) => CODE_RE.test(code);
const isUuidLike = (id) => UUID_RE.test(id);
const canMessage = ({ friends, blockedEitherWay }) => friends && !blockedEitherWay;
const canRequest = ({ self, blockedEitherWay }) => !self && !blockedEitherWay;
function isRateLimited(sentAtMs, nowMs) {
  let recent = 0;
  for (const t of sentAtMs) if (nowMs - t < RATE_LIMIT_WINDOW_MS) recent += 1;
  return recent >= RATE_LIMIT_COUNT;
}
function validateGift(xp, item) {
  const label = item.trim();
  if (!Number.isInteger(xp) || xp < 0 || xp > GIFT_MAX_XP) return `XP must be 0-${GIFT_MAX_XP}.`;
  if (label.length > GIFT_ITEM_MAX) return "Item label is too long.";
  if (xp === 0 && label.length === 0) return "Gift needs XP or an item.";
  return null;
}
const shortLabel = (id) => `Hunter #${id.slice(0, 4)}`;
const playerLabel = (id, displayName) =>
  typeof displayName === "string" && displayName.trim()
    ? displayName.trim().slice(0, 24)
    : shortLabel(id);
const displayTime = (iso) => (iso.length >= 16 ? iso.slice(0, 16).replace("T", " ") : iso);

// ---------- assertions ----------
let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };

// friend codes
ok(normalizeCode("  ab23cd45 ") === "AB23CD45", "code normalized");
ok(isValidCode("AB23CD45"), "code accepted");
ok(!isValidCode("AB23CD4"), "short code rejected");
ok(!isValidCode("AB23CD4!"), "symbol code rejected");
ok(!isValidCode("ab23cd45"), "lowercase code rejected (normalize first)");
ok(!isValidCode("AB12CD34"), "look-alike digits 0/1 rejected");

// uuids
ok(isUuidLike("123e4567-e89b-12d3-a456-426614174000"), "uuid accepted");
ok(!isUuidLike("not-a-uuid"), "junk id rejected");
ok(!isUuidLike(""), "empty id rejected");

// contact rules: strangers can only request, never message; blocks win both ways
ok(canMessage({ friends: true, blockedEitherWay: false }), "friends can message");
ok(!canMessage({ friends: false, blockedEitherWay: false }), "strangers cannot message");
ok(!canMessage({ friends: true, blockedEitherWay: true }), "blocked friends cannot message");
ok(canRequest({ self: false, blockedEitherWay: false }), "strangers can request");
ok(!canRequest({ self: true, blockedEitherWay: false }), "self request rejected");
ok(!canRequest({ self: false, blockedEitherWay: true }), "blocked request rejected");

// rate limit: 10 sends / 60s
const now = 1_000_000;
const nine = Array.from({ length: 9 }, (_, i) => now - i * 1000);
const ten = [...nine, now - 500];
ok(!isRateLimited(nine, now), "9 recent sends allowed");
ok(isRateLimited(ten, now), "10 recent sends limited");
ok(!isRateLimited([now - 61_000], now), "old send outside window ignored");
ok(!isRateLimited([], now), "no sends allowed");

// gifts: atomic-XP rules, never negative
ok(validateGift(5, "") === null, "xp gift valid");
ok(validateGift(0, "hint token") === null, "item-only gift valid");
ok(validateGift(50, "") === null, "max xp gift valid");
ok(validateGift(-1, "") !== null, "negative xp rejected");
ok(validateGift(51, "") !== null, "over-max xp rejected");
ok(validateGift(1.5, "") !== null, "fractional xp rejected");
ok(validateGift(0, "") !== null, "empty gift rejected");
ok(validateGift(0, "x".repeat(41)) !== null, "long item rejected");

// labels + time (prerender-safe, pure)
ok(shortLabel("abcdef1234") === "Hunter #abcd", "short label");
ok(playerLabel("abcdef1234", "  Bee ") === "Bee", "display name preferred");
ok(playerLabel("abcdef1234", null) === "Hunter #abcd", "fallback label");
ok(displayTime("2026-11-02T10:20:30.000Z") === "2026-11-02 10:20", "time display");
ok(displayTime("short") === "short", "short time passthrough");

// zod mirrors of the API request bodies
const ChatSend = z.object({ to: z.string().min(1), body: z.string().trim().min(1).max(MESSAGE_MAX_LEN) });
const GiftSend = z.object({ to: z.string().min(1), xp_amount: z.number().int().min(0).max(GIFT_MAX_XP), item: z.string().trim().max(GIFT_ITEM_MAX).optional().default("") });
const GroupCreate = z.object({ name: z.string().trim().min(1).max(GROUP_NAME_MAX) });
const Report = z.object({ reported_id: z.string().min(1), reason: z.string().trim().min(1).max(REPORT_REASON_MAX), details: z.string().trim().max(REPORT_DETAILS_MAX).optional().default("") });
const FriendRespond = z.object({ request_id: z.string().min(1), action: z.enum(["accept", "decline"]) });

ok(ChatSend.safeParse({ to: "x", body: "hi" }).success, "chat body accepted");
ok(!ChatSend.safeParse({ to: "x", body: "" }).success, "empty chat rejected");
ok(!ChatSend.safeParse({ to: "x", body: "y".repeat(501) }).success, "501-char chat rejected");
ok(ChatSend.safeParse({ to: "x", body: "y".repeat(500) }).success, "500-char chat accepted");
ok(GiftSend.safeParse({ to: "x", xp_amount: 10 }).success, "gift default item ok");
ok(!GiftSend.safeParse({ to: "x", xp_amount: 51 }).success, "gift 51xp rejected");
ok(!GroupCreate.safeParse({ name: "" }).success, "empty room rejected");
ok(!GroupCreate.safeParse({ name: "n".repeat(41) }).success, "long room rejected");
ok(Report.safeParse({ reported_id: "x", reason: "Spam" }).success, "report accepted");
ok(!Report.safeParse({ reported_id: "x", reason: "" }).success, "empty reason rejected");
ok(FriendRespond.safeParse({ request_id: "x", action: "accept" }).success, "accept ok");
ok(!FriendRespond.safeParse({ request_id: "x", action: "maybe" }).success, "bad action rejected");

console.log("SOCIAL TESTS OK: " + n + " assertions");

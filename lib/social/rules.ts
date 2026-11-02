// Pure social rules shared by API routes and UI (no server imports).
// Mirrored self-contained in scripts/test-social.mjs for offline tests.
export const MESSAGE_MAX_LEN = 500;
export const RATE_LIMIT_COUNT = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const GIFT_MAX_XP = 50;
export const GIFT_ITEM_MAX = 40;
export const GROUP_NAME_MAX = 40;
export const REPORT_REASON_MAX = 60;
export const REPORT_DETAILS_MAX = 500;
export const CODE_LEN = 8;
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes
export const CHAT_POLL_MS = 3000;

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function isUuidLike(id: string): boolean {
  return UUID_RE.test(id);
}

// Server route handlers only (never during render).
export function newCode(): string {
  let out = "";
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

// Strangers can only send friend requests, never messages/gifts/challenges.
export function canMessage(args: { friends: boolean; blockedEitherWay: boolean }): boolean {
  return args.friends && !args.blockedEitherWay;
}

export function canRequest(args: { self: boolean; blockedEitherWay: boolean }): boolean {
  return !args.self && !args.blockedEitherWay;
}

// True when `sentAtMs` holds RATE_LIMIT_COUNT+ sends inside the window.
export function isRateLimited(sentAtMs: number[], nowMs: number): boolean {
  let recent = 0;
  for (const t of sentAtMs) {
    if (nowMs - t < RATE_LIMIT_WINDOW_MS) recent += 1;
  }
  return recent >= RATE_LIMIT_COUNT;
}

// Returns an error message, or null when the gift is valid.
export function validateGift(xp: number, item: string): string | null {
  const label = item.trim();
  if (!Number.isInteger(xp) || xp < 0 || xp > GIFT_MAX_XP) {
    return `XP must be 0-${GIFT_MAX_XP}.`;
  }
  if (label.length > GIFT_ITEM_MAX) return `Item label is too long (max ${GIFT_ITEM_MAX}).`;
  if (xp === 0 && label.length === 0) return "Gift needs XP or an item.";
  return null;
}

export function shortLabel(id: string): string {
  return `Hunter #${id.slice(0, 4)}`;
}

export function playerLabel(id: string, displayName: unknown): string {
  return typeof displayName === "string" && displayName.trim()
    ? displayName.trim().slice(0, 24)
    : shortLabel(id);
}

// Pure string slice — prerender-safe (no Date construction during render).
export function displayTime(iso: string): string {
  return iso.length >= 16 ? iso.slice(0, 16).replace("T", " ") : iso;
}

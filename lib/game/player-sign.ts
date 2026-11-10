import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Signed anonymous-identity cookie. Value format: `${id}.${hmac}` where hmac
// is HMAC-SHA256(id, secret) hex-truncated to 32 chars. The secret is
// server-only (PLAYER_SECRET, else MODEL_API_KEY) and must never be exposed
// or imported by client code. Pure: mirror-tested in test-player-cookie.mjs.
// Set PLAYER_SECRET in prod: without it each boot mints a random secret,
// which invalidates every cookie on restart (safe, but logs everyone out).
const BOOT = randomBytes(32).toString("hex");
function secret(): string {
  return process.env.PLAYER_SECRET ?? process.env.MODEL_API_KEY ?? BOOT;
}

export function signPlayerId(id: string): string {
  const hmac = createHmac("sha256", secret()).update(id).digest("hex").slice(0, 32);
  return `${id}.${hmac}`;
}

// Returns the player id when the signature is valid, else null. Legacy
// unsigned values (no dot) also return null — the caller upgrades those via
// a DB check.
export function verifyPlayerCookie(value: string): string | null {
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

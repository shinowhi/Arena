// Offline tests: signed player cookie. No network.
// Run: node arena/scripts/test-player-cookie.mjs
// Note: mirrors signPlayerId/verifyPlayerCookie in lib/game/player-sign.ts.
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";

// Mirror of lib/game/player-sign.ts (same algorithm, test secret).
process.env.PLAYER_SECRET = "test-secret";
const secret = () => process.env.PLAYER_SECRET ?? process.env.MODEL_API_KEY ?? "";
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

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

const ID = "123e4567-e89b-12d3-a456-426614174000";
// Signed format: id + 32 hex chars.
const signed = signPlayerId(ID);
ok(signed.startsWith(`${ID}.`) && /^[0-9a-f]{32}$/.test(signed.slice(ID.length + 1)), "signed id.hmac32 format");
// Round-trip verifies.
ok(verifyPlayerCookie(signed) === ID, "valid signature verifies");
// Tampered id or signature fails.
ok(verifyPlayerCookie(`x${signed.slice(1)}`) === null, "tampered id rejected");
ok(verifyPlayerCookie(`${signed.slice(0, -1)}${signed.endsWith("0") ? "1" : "0"}`) === null, "tampered sig rejected");
// Legacy unsigned value does not verify (caller upgrades via DB check).
ok(verifyPlayerCookie(ID) === null, "unsigned legacy rejected");
// Signing is deterministic per secret.
ok(signPlayerId(ID) === signed, "signing deterministic");

console.log(`PLAYER COOKIE TESTS OK: ${n} assertions`);

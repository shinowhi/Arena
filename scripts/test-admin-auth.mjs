// Offline tests: admin dashboard cookie. No network.
// Run: node arena/scripts/test-admin-auth.mjs
// Note: mirrors signAdmin/verifyAdmin in lib/game/player-sign.ts.
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";

// Mirror of signAdmin/verifyAdmin in lib/game/player-sign.ts (test secret).
process.env.ADMIN_SECRET = "test-admin-secret";
function signAdmin() {
  const s = process.env.ADMIN_SECRET;
  if (!s) return null;
  const hmac = createHmac("sha256", s).update("admin").digest("hex").slice(0, 32);
  return `admin.${hmac}`;
}
function verifyAdmin(value) {
  const s = process.env.ADMIN_SECRET;
  if (!s || !value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const id = value.slice(0, dot);
  if (id !== "admin") return false;
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", s).update(id).digest("hex").slice(0, 32);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Signed format: admin + 32 hex chars.
const signed = signAdmin();
ok(typeof signed === "string" && signed.startsWith("admin.") && /^[0-9a-f]{32}$/.test(signed.slice(6)), "signed admin.hmac32 format");
// Round-trip verifies.
ok(verifyAdmin(signed) === true, "valid admin cookie verifies");
// Tampered signature fails.
ok(verifyAdmin(`${signed.slice(0, -1)}${signed.endsWith("0") ? "1" : "0"}`) === false, "tampered sig rejected");
// Player-style id with a valid player-shaped signature is not admin.
ok(verifyAdmin(`some-player-id.${signed.slice(6)}`) === false, "non-admin id rejected");
// Unsigned / garbage values fail.
ok(verifyAdmin("admin") === false, "unsigned value rejected");
ok(verifyAdmin("") === false, "empty value rejected");
ok(verifyAdmin(null) === false, "missing cookie rejected");
// Signing is deterministic per secret.
ok(signAdmin() === signed, "signing deterministic");
// A cookie signed under another secret fails.
process.env.ADMIN_SECRET = "other-secret";
ok(verifyAdmin(signed) === false, "cross-secret cookie rejected");
// Unset secret: sign returns null, verify always fails (never open).
delete process.env.ADMIN_SECRET;
ok(signAdmin() === null, "unset secret signs nothing");
ok(verifyAdmin(signed) === false, "unset secret verifies nothing");

console.log(`ADMIN AUTH TESTS OK: ${n} assertions`);

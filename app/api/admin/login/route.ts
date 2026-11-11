import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { signAdmin } from "@/lib/game/player-sign";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Admin login: POST with {key} (JSON body) or a plain form post from /admin.
// On success sets the httpOnly arena_admin cookie; JSON callers
// get {ok:true}, form posts redirect back to /admin. Failures are a flat 401
// (or a redirect with ?err=1) whether the key is wrong or ADMIN_SECRET is
// unset — no info leak either way.
const COOKIE = "arena_admin";

function keyOk(key: unknown, secret: string): boolean {
  if (typeof key !== "string" || key.length === 0 || key.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(key), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rl = checkRate(`admin-login:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const secret = process.env.ADMIN_SECRET;
  const ct = req.headers.get("content-type") ?? "";
  const wantsJson = ct.includes("application/json");
  let key: unknown;
  if (wantsJson) {
    key = ((await req.json().catch(() => null)) as { key?: unknown } | null)?.key;
  } else {
    key = (await req.formData().catch(() => null))?.get("key");
  }
  const token = secret && keyOk(key, secret) ? signAdmin() : null;
  if (!token) {
    if (wantsJson) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    return NextResponse.redirect(new URL("/admin?err=1", req.url), { status: 303 });
  }
  const res = wantsJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL("/admin", req.url), { status: 303 });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
  return res;
}

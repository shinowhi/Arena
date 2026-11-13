import { NextResponse } from "next/server";

// In-memory fixed-window rate limiter. Per-instance by design: on serverless
// each isolate tracks its own counters, so limits are approximate under
// scale-out — good enough to blunt abuse, not a billing gate.
export const MINUTE_MS = 60_000;

type Bucket = { used: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

// `now` is injectable for tests (mirror-tested in test-rate-limit.mjs).
export function checkRate(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): { ok: boolean; retryAfterSec: number } {
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { used: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (cur.used < limit) {
    cur.used += 1;
    return { ok: true, retryAfterSec: 0 };
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
}

// Pure client-IP parser (mirror-tested in test-security.mjs). Prefers
// x-real-ip, which Vercel/the edge overwrites with the true client IP: the
// first X-Forwarded-For entry is attacker-spoofable (any client can prepend
// an arbitrary address), so trusting it first lets one actor mint unlimited
// rate-limit buckets. XFF-first is kept only as a fallback for proxies that
// don't set x-real-ip.
export function parseClientIp(headers: Pick<Headers, "get">): string {
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

export function getClientIp(req: Request): string {
  return parseClientIp(req.headers);
}

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many requests — slow down and retry." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

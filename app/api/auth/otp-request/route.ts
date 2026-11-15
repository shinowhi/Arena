import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_ROLES, PENDING_ROLE_COOKIE } from "@/lib/auth/session";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/auth/otp-request — rate-limit precheck + pending-role stash for
// the magic-link flow. Body {email, role?}: validates the address, applies
// the IP bucket (5/min) + per-address bucket (5/min), stashes the validated
// role in the short-lived HttpOnly arena_pending_role cookie, and answers
// {ok:true}. It sends NOTHING itself: the browser then calls
// signInWithOtp directly (PKCE verifier must land in the browser's cookies,
// which a server-side call can never do). NO Supabase call here by design.
//
// The pending cookie is OTP-path-only: the Google flow threads ?role=
// through redirectTo instead (see login-form.tsx) and never touches this
// route, so a missing pending cookie on the callback is normal — the
// callback prefers ?role=, then this cookie, then student.
const Body = z.object({
  email: z.string(),
  role: z.enum(AUTH_ROLES).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const email = parsed.success ? parsed.data.email.trim().toLowerCase() : "";
  if (
    !parsed.success ||
    email.length === 0 ||
    email.length > 254 ||
    !z.email().safeParse(email).success
  ) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  // IP bucket FIRST (abuse: email bombing), then a per-address bucket so one
  // victim can't be bombed from rotating IPs.
  const ipRl = checkRate(`auth-otp:${getClientIp(req)}`, 5, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  const emailRl = checkRate(`auth-otp-email:${email}`, 5, MINUTE_MS);
  if (!emailRl.ok) return rateLimitResponse(emailRl.retryAfterSec);
  const res = NextResponse.json({ ok: true });
  if (parsed.data.role) {
    res.cookies.set(PENDING_ROLE_COOKIE, parsed.data.role, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60,
      path: "/",
    });
  }
  return res;
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/auth";
import { AUTH_ROLES, PENDING_ROLE_COOKIE } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/auth/origin";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/auth/otp — send a Supabase magic (email OTP) link. Body
// {email, role?}: the role is stashed in a short-lived cookie so
// /auth/callback can link with it after the email round-trip (?role= wins
// when both are present). No account enumeration: signInWithOtp succeeds for
// new addresses too (Supabase creates the user on first OTP).
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
  let auth: Awaited<ReturnType<typeof createAuthClient>>;
  try {
    auth = await createAuthClient();
  } catch {
    return NextResponse.json(
      { error: "Login is not set up yet — try again later." },
      { status: 503 },
    );
  }
  let origin: string;
  try {
    origin = siteOrigin(req);
  } catch {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  try {
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      return NextResponse.json(
        { error: "Could not send the login email — retry." },
        { status: 500 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not send the login email — retry." },
      { status: 500 },
    );
  }
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

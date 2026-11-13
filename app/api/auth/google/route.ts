import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/auth";
import { normalizeRole } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/auth/origin";

// GET /api/auth/google — start Google OAuth: 302s to the Supabase-hosted
// authorize URL, which returns to /auth/callback. ?role= is validated and
// threaded through the callback URL (unknown roles dropped, never trusted).
// Failures (provider not enabled, Auth misconfigured) redirect to
// /login?err=1, never 500 — except a missing pinned origin in production,
// which is an explicit 500 (server misconfigured, fix the env).
//
// DASHBOARD SETUP (user steps — secrets stay in the dashboard, never in code):
//   1. Supabase dashboard -> Authentication -> Providers -> Google -> enable,
//      paste the Google OAuth client ID + secret there (from Google Cloud
//      Console -> APIs & Services -> Credentials -> OAuth client ID).
//   2. Google Cloud Console -> same OAuth client -> Authorized redirect URIs:
//      add https://<project-ref>.supabase.co/auth/v1/callback.
//   3. Supabase dashboard -> Authentication -> URL Configuration -> Site URL:
//      the production origin; add <origin>/auth/callback under Redirect URLs
//      (plus http://localhost:3000/auth/callback for local dev).
export async function GET(req: Request) {
  let origin: string;
  try {
    origin = siteOrigin(req);
  } catch {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const loginErr = new URL("/login?err=1", origin);
  try {
    const auth = await createAuthClient();
    const url = new URL(req.url);
    // Role rides in the callback URL (same-device OAuth keeps it; the pending
    // cookie would too — but a magic link opened on ANOTHER device loses the
    // cookie, so the query param is the robust channel and the callback
    // prefers it). The ?role= rides on the allowlisted callback path above.
    const role = normalizeRole(url.searchParams.get("role"));
    const redirectTo = `${origin}/auth/callback${role ? `?role=${role}` : ""}`;
    const { data, error } = await auth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error || !data?.url) return NextResponse.redirect(loginErr);
    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect(loginErr);
  }
}

import { createBrowserClient } from "@supabase/ssr";

// SECURITY PHASE-2a: AUTH-ONLY browser client. Used SOLELY to start the
// Supabase Auth PKCE flows from the browser — signInWithOtp (magic link) and
// signInWithOAuth (Google) — so the PKCE code_verifier + session live in
// THIS browser's cookies, where /auth/callback's server client can read the
// verifier back and complete exchangeCodeForSession. Starting those calls
// server-side (as /api/auth/otp + /api/auth/google used to) sets the
// verifier cookie on the server's response, never in the browser — so the
// callback's exchange ALWAYS failed and every login landed on /login?err=1.
//
// TABLE READS FORBIDDEN on this client: post-0019 the anon key can read
// nothing (policies revoked) and post-0020 the auth tables are deny-all, so
// browser-direct reads silently return empty. All data access stays on the
// API routes (service role). Do NOT reuse this for anything but Auth calls.
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

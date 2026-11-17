import { createClient as createJsClient } from "@supabase/supabase-js";

// SECURITY PHASE-1 master switch: server-side Supabase now uses the SERVICE
// ROLE key (server-only env; never NEXT_PUBLIC_*), NOT the anon key. This is
// behavior-preserving because every anon RLS policy being revoked in
// migration 0019 is fully open (using(true)) and all ownership checks are
// enforced app-side in the API routes. service_role bypasses RLS, so every
// existing query keeps working while anon/authenticated lose direct access.
// Non-production fallback: when SUPABASE_SERVICE_ROLE_KEY is unset AND
// NODE_ENV !== "production", fall back to the anon key with a warning so
// local dev keeps working without the secret.
//
// SESSION-LESS BY DESIGN: plain supabase-js with persistSession:false — it
// never reads auth cookies, so Authorization ALWAYS carries the service JWT.
// A createServerClient+cookies service client silently degrades to the
// `authenticated` role on any request carrying a user session (supabase-js
// prefers the session access token for Authorization), and post-0019/0020
// deny-all that 42501s every query. Found live: the /auth/callback exchange
// writes fresh session cookies into the same request, so the very next DB
// call ran as `authenticated` — first login died at link-mint. Auth identity
// stays on the anon-key client in lib/supabase/auth.ts; no route may call
// .auth.* on THIS client.
let warnedAnonFallback = false;
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not set — add it to the production env (server-only; " +
          "copy it from the Supabase dashboard API settings, never expose it as NEXT_PUBLIC_*).",
      );
    }
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!warnedAnonFallback) {
      warnedAnonFallback = true;
      console.warn(
        "[supabase/server] SUPABASE_SERVICE_ROLE_KEY is unset — falling back to the anon key " +
          "for local dev only. Set the service key (and run migration 0019) before deploying.",
      );
    }
  }
  // Session-less: never touches cookies, so the service JWT always rides
  // Authorization (see header comment). Async signature kept — every route
  // awaits this.
  return createJsClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

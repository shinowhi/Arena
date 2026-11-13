import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// SECURITY PHASE-1 master switch: server-side Supabase now uses the SERVICE
// ROLE key (server-only env; never NEXT_PUBLIC_*), NOT the anon key. This is
// behavior-preserving because every anon RLS policy being revoked in
// migration 0019 is fully open (using(true)) and all ownership checks are
// enforced app-side in the API routes. service_role bypasses RLS, so every
// existing query keeps working while anon/authenticated lose direct access.
// Non-production fallback: when SUPABASE_SERVICE_ROLE_KEY is unset AND
// NODE_ENV !== "production", fall back to the anon key with a warning so
// local dev keeps working without the secret.
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
  const cookieStore = await cookies();
  return createServerClient(url!, key!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (pairs) => {
        try {
          pairs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component read-only context; middleware refreshes the session.
        }
      },
    },
  });
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// SECURITY PHASE-2a: AUTH-ONLY client. Built on the ANON (publishable) key
// with the same cookie adapter as lib/supabase/server.ts, and used ONLY for
// Supabase Auth calls — signInWithOtp, signInWithOAuth, exchangeCodeForSession,
// getUser, signOut. NEVER use it for table reads/writes: post-0019 the anon
// key can read nothing (policies revoked) and post-0020 the auth tables are
// deny-all; table access stays on the service client in server.ts with
// app-side owner checks.
//
// WHY NOT REUSE server.ts: it uses the SERVICE-ROLE key, which authenticates
// every request AS the admin (the service JWT rides in the Authorization
// header), so GoTrue never sees the end user's own access token from the
// sb-* cookies — auth.getUser() on a service-key client cannot resolve a user
// session. Session proof needs a client on the anon key, which forwards the
// user's token and lets GoTrue identify the caller.
export async function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase Auth is not configured — set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (copy them from the Supabase dashboard " +
        "API settings).",
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (pairs) => {
        try {
          pairs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component read-only context; the /auth/callback route
          // handler (which CAN set cookies) owns session writes.
        }
      },
    },
  });
}

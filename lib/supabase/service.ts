import { createClient } from "@supabase/supabase-js";

// Service-role client for server-only admin RPCs (migration 0012: EXECUTE on
// the admin_* functions is revoked from every public role and granted only to
// service_role). No cookies — callers MUST verify admin auth first (via
// verifyAdminRequest in routes, verifyAdmin in server components) BEFORE
// touching this client, because it bypasses RLS.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — add it to .env.local (server-only; " +
        "copy it from the Supabase dashboard API settings, never expose it as NEXT_PUBLIC_*).",
    );
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

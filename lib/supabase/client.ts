import { createBrowserClient } from "@supabase/ssr";

// SECURITY PHASE-1: DO NOT USE post-0019. The anon key can no longer read
// anything (policies revoked); browser-direct reads silently return empty.
// All data access must go through API routes (server uses service role).
// Kept only so old imports fail loud at review, not silently at runtime.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

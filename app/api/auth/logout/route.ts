import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuthClient } from "@/lib/supabase/auth";
import { PENDING_ROLE_COOKIE } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/auth/origin";

// POST /api/auth/logout — sign out of Supabase Auth, clear the sb-* session
// cookies plus the pending-role stash, and 303 to /. The anonymous
// arena_player_id cookie is KEPT: logout only drops the login — the device
// keeps its game progress, and the auth_links row persists for the next
// login. Never throws (redirects home even when signOut or the cookie clear
// fails) — except a missing pinned origin in production, an explicit 500.
export async function POST(req: Request) {
  let origin: string;
  try {
    origin = siteOrigin(req);
  } catch {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const home = new URL("/", origin);
  try {
    const auth = await createAuthClient().catch(() => null);
    if (auth) await auth.auth.signOut().catch(() => null);
  } catch {
    // Fall through to the cookie clear + redirect.
  }
  const res = NextResponse.redirect(home, 303);
  try {
    const store = await cookies();
    for (const c of store.getAll()) {
      if (c.name.startsWith("sb-")) res.cookies.delete(c.name);
    }
    res.cookies.delete(PENDING_ROLE_COOKIE);
  } catch {
    // Redirect anyway.
  }
  return res;
}

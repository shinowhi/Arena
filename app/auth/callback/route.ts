import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuthClient } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId, PLAYER_COOKIE_MAX_AGE } from "@/lib/game/player";
import { signPlayerId } from "@/lib/game/player-sign";
import {
  getAuthUser,
  linkDecision,
  normalizeRole,
  PENDING_ROLE_COOKIE,
  PLAYER_COOKIE_NAME,
} from "@/lib/auth/session";
import { siteOrigin } from "@/lib/auth/origin";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

// GET /auth/callback — Supabase Auth return leg (?code=): exchanges the code
// for a session, then links the auth user to a player:
//   already-linked -> adopt the linked player (idempotent re-login) -> /me
//   link-cookie    -> link the signed-cookie player (adopt progress) -> /me?first=1
//   create-new     -> mint a player + link it -> /me?first=1
// Ghost cookie (signed id, row gone) falls through to create-new; claimed
// cookie progress (linked to another account) mints fresh but redirects
// /login?err=claimed instead of a silent first=1. Role: ?role= wins, else the
// pending cookie from /api/auth/otp, else 'student' (validated; unknowns fail
// closed to student). The player cookie is re-asserted to the linked player
// so every cookie-based route sees the same identity after login. The
// callback itself is IP rate-limited (20/min) before the code exchange.
// Never throws: failures redirect /login?err=1 (or an explicit 500 when the
// pinned origin is missing in production).
// Login-CSRF accepted: ?code= is a bearer GET, so a planted link could bind
// this device to someone else's login — accepted (needs a victim click).

type ServiceDb = SupabaseClient;
type LinkRow = { player_id: string; role: string };

function setPlayerCookie(store: Awaited<ReturnType<typeof cookies>>, playerId: string) {
  // Same flags as lib/game/player.ts getOrCreatePlayerId (single duplication
  // point for the name: PLAYER_COOKIE_NAME in lib/auth/session.ts).
  store.set(PLAYER_COOKIE_NAME, signPlayerId(playerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PLAYER_COOKIE_MAX_AGE,
    path: "/",
  });
}

async function readLink(supabase: ServiceDb, authUserId: string): Promise<LinkRow | null> {
  const r = await supabase
    .from("auth_links")
    .select("player_id, role")
    .eq("auth_user_id", authUserId)
    .limit(1);
  if (r.error || !Array.isArray(r.data) || r.data.length === 0) return null;
  return r.data[0] as LinkRow;
}

async function mintPlayer(supabase: ServiceDb): Promise<string> {
  const { data, error } = await supabase.from("players").insert({}).select("id").single();
  if (error || !data) throw new Error("mint player");
  return (data as { id: string }).id;
}

async function insertLink(
  supabase: ServiceDb,
  authUserId: string,
  playerId: string,
  role: string,
): Promise<boolean> {
  const r = await supabase
    .from("auth_links")
    .insert({ auth_user_id: authUserId, player_id: playerId, role });
  return !r.error;
}

export async function GET(req: Request) {
  let origin: string;
  try {
    origin = siteOrigin(req);
  } catch {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const url = new URL(req.url);
  const fail = () => NextResponse.redirect(new URL("/login?err=1", origin));
  const code = url.searchParams.get("code");
  if (!code) return fail();
  const ipRl = checkRate(`auth-callback:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const auth = await createAuthClient();
    const { error: xchg } = await auth.auth.exchangeCodeForSession(code);
    if (xchg) return fail();
    const user = await getAuthUser(auth);
    if (!user) return fail();
    const supabase = await createClient();
    // Owner check inherent: the row is keyed by the verified auth user id.
    const link = await readLink(supabase, user.id);
    if (!link) {
      // Distinguish "no link yet" from "table missing" (run 0020): probe once
      // so a missing migration fails closed to login instead of minting an
      // orphan player + a doomed insert.
      const probe = await supabase.from("auth_links").select("auth_user_id").limit(0);
      if (probe.error) return fail();
    }
    const cookiePlayer = await getPlayerId().catch(() => null);
    const store = await cookies();
    // Query wins, then the pending cookie, then student. (Cross-device loss:
    // the pending cookie never leaves this browser — a magic link opened on
    // another device drops the role and lands on student. OAuth threads role
    // via ?role= for exactly this reason.)
    const role =
      normalizeRole(url.searchParams.get("role")) ??
      normalizeRole(store.get(PENDING_ROLE_COOKIE)?.value) ??
      "student";
    const decision = linkDecision(cookiePlayer, link);
    const done = (playerId: string, first: boolean) => {
      setPlayerCookie(store, playerId);
      store.delete(PENDING_ROLE_COOKIE);
      return NextResponse.redirect(new URL(first ? "/me?first=1" : "/me", origin));
    };
    if (decision === "already-linked" && link) return done(link.player_id, false);
    let playerId = decision === "link-cookie" && cookiePlayer ? cookiePlayer : null;
    if (playerId) {
      // Ghost cookie (signed id, row gone — deleted elsewhere): fall through
      // to mint instead of linking a dangling id.
      const probe = await supabase.from("players").select("id").eq("id", playerId).limit(1);
      if (probe.error || !Array.isArray(probe.data) || probe.data.length === 0) playerId = null;
    }
    try {
      playerId = playerId ?? (await mintPlayer(supabase));
    } catch {
      return fail();
    }
    if (await insertLink(supabase, user.id, playerId, role)) {
      return done(playerId, true);
    }
    // Insert lost a race (a link appeared between read and insert) or the
    // cookie player is taken by another login (shared device): adopt the
    // winner when one exists for THIS user, else mint fresh once.
    const winner = await readLink(supabase, user.id);
    if (winner) return done(winner.player_id, false);
    // Claimed progress: we came to adopt cookie progress but that player is
    // linked to ANOTHER account — link a fresh player so the login still
    // works, but say so explicitly instead of a silent first=1.
    let claimed = false;
    if (decision === "link-cookie" && cookiePlayer) {
      const taken = await supabase
        .from("auth_links")
        .select("auth_user_id")
        .eq("player_id", cookiePlayer)
        .limit(1);
      claimed = !taken.error && Array.isArray(taken.data) && taken.data.length > 0;
    }
    try {
      playerId = await mintPlayer(supabase);
    } catch {
      return fail();
    }
    if (await insertLink(supabase, user.id, playerId, role)) {
      if (claimed) {
        setPlayerCookie(store, playerId);
        store.delete(PENDING_ROLE_COOKIE);
        return NextResponse.redirect(new URL("/login?err=claimed", origin));
      }
      return done(playerId, true);
    }
    return fail();
  } catch {
    return fail();
  }
}

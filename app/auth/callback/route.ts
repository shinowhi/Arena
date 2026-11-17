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
// pending cookie from /api/auth/otp-request (OTP path only — Google threads
// ?role= and never sets it), else 'student' (validated; unknowns fail
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

async function mintPlayer(supabase: ServiceDb): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const { data, error } = await supabase.from("players").insert({}).select("id").single();
  if (!error && data) return { ok: true, id: (data as { id: string }).id };
  // Sanitized PG code (safe: 5-char class code, no internals).
  const raw = String((error as { code?: unknown } | null)?.code ?? "db");
  return { ok: false, code: /^[a-z0-9]{2,8}$/i.test(raw) ? raw : "db" };
}

async function insertLink(
  supabase: ServiceDb,
  authUserId: string,
  playerId: string,
  role: string,
): Promise<{ ok: boolean; code: string }> {
  const r = await supabase
    .from("auth_links")
    .insert({ auth_user_id: authUserId, player_id: playerId, role });
  if (!r.error) return { ok: true, code: "" };
  // Sanitized PG code for diagnosis (safe: 5-char class code, no internals).
  const raw = String((r.error as { code?: unknown }).code ?? "db");
  const code = /^[a-z0-9]{2,8}$/i.test(raw) ? raw : "db";
  return { ok: false, code };
}

export async function GET(req: Request) {
  let origin: string;
  try {
    origin = siteOrigin(req);
  } catch {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const url = new URL(req.url);
  // Staged error codes (safe, no internals) so a failed login reports WHERE
  // it broke instead of one generic message: exchange = bad/expired link,
  // nouser = session unreadable, link = account-linking DB failure.
  const fail = (stage = "1") => NextResponse.redirect(new URL(`/login?err=${stage}`, origin));
  const code = url.searchParams.get("code");
  if (!code) return fail("exchange");
  const ipRl = checkRate(`auth-callback:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const auth = await createAuthClient();
    const { error: xchg } = await auth.auth.exchangeCodeForSession(code);
    if (xchg) return fail("exchange");
    const user = await getAuthUser(auth);
    if (!user) return fail("nouser");
    const supabase = await createClient();
    // Owner check inherent: the row is keyed by the verified auth user id.
    const link = await readLink(supabase, user.id);
    if (!link) {
      // Distinguish "no link yet" from "table missing" (run 0020): probe once
      // so a missing migration fails closed to login instead of minting an
      // orphan player + a doomed insert. NOTE: limit(0) is invalid PostgREST
      // (must be >= 1) — a limit(0) probe errors always and bricks every
      // first login; use limit(1).
      const probe = await supabase.from("auth_links").select("auth_user_id").limit(1);
      if (probe.error) {
        const pg = String((probe.error as { code?: unknown }).code ?? "");
        if (pg === "42P01") return fail("link-probe");
        // Transient read error: fall through and let the insert below report
        // its own code rather than mislabeling it as a missing table.
      }
    }
    const cookiePlayer = await getPlayerId().catch(() => null);
    const store = await cookies();
    // Query wins, then the pending cookie, then student. (Cross-device loss:
    // the pending cookie never leaves this browser — a magic link opened on
    // another device drops the role and lands on student. OAuth threads role
    // via ?role= for exactly this reason; a missing pending cookie is normal
    // on the Google path, never an error.)
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
    if (!playerId) {
      const minted = await mintPlayer(supabase);
      if (!minted.ok) return fail(`link-mint-${minted.code}`);
      playerId = minted.id;
    }
    const first = await insertLink(supabase, user.id, playerId, role);
    if (first.ok) {
      return done(playerId, true);
    }
    const firstCode = first.code;
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
    const minted2 = await mintPlayer(supabase);
    if (!minted2.ok) return fail(`link-mint-${minted2.code}`);
    playerId = minted2.id;
    const second = await insertLink(supabase, user.id, playerId, role);
    if (second.ok) {
      if (claimed) {
        setPlayerCookie(store, playerId);
        store.delete(PENDING_ROLE_COOKIE);
        return NextResponse.redirect(new URL("/login?err=claimed", origin));
      }
      return done(playerId, true);
    }
    return fail(`link-${firstCode}-${second.code}`);
  } catch {
    return fail();
  }
}

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signPlayerId, verifyPlayerCookie } from "./player-sign";

const COOKIE = "arena_player_id";

// Anonymous identity via signed cookie (no login in v1). The value MUST
// carry a valid HMAC signature: bare UUIDs are NEVER accepted, even when a
// matching player row exists (SECURITY PHASE-1 deleted the legacy
// unsigned-cookie upgrade path — a bare UUID from a leaked DB grants
// nothing without PLAYER_SECRET). Invalid/missing cookies mint a new
// player here, or return null in getPlayerId.
export const PLAYER_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export async function getOrCreatePlayerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) {
    const verified = verifyPlayerCookie(existing);
    if (verified) return verified;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("players").insert({}).select("id").single();
  if (error || !data) throw new Error("Could not create player.");
  const id = (data as { id: string }).id;
  store.set(COOKIE, signPlayerId(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PLAYER_COOKIE_MAX_AGE,
    path: "/",
  });
  return id;
}

// Read-only identity lookup: verifies the signed cookie, else returns null.
// NEVER inserts a player row and NEVER sets a cookie — for gates and GET
// routes that must not mint players.
export async function getPlayerId(): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (!existing) return null;
  return verifyPlayerCookie(existing);
}

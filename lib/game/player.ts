import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { signPlayerId, verifyPlayerCookie } from "./player-sign";

const COOKIE = "arena_player_id";

// Anonymous identity via signed cookie (no login in v1). Valid signatures
// skip the DB check; legacy unsigned cookies are honored once via a DB row
// check, then re-issued signed; invalid/missing cookies mint a new player.
export async function getOrCreatePlayerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  const supabase = await createClient();
  if (existing) {
    const verified = verifyPlayerCookie(existing);
    if (verified) return verified;
    if (!existing.includes(".")) {
      const { data } = await supabase.from("players").select("id").eq("id", existing).single();
      if (data) {
        store.set(COOKIE, signPlayerId(existing), {
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
        });
        return existing;
      }
    }
  }
  const { data, error } = await supabase.from("players").insert({}).select("id").single();
  if (error || !data) throw new Error("Could not create player.");
  const id = (data as { id: string }).id;
  store.set(COOKIE, signPlayerId(id), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return id;
}

// Read-only identity lookup: verifies the signed cookie, honors legacy
// unsigned cookies via a DB row check, else returns null. NEVER inserts a
// player row and NEVER sets a cookie — for gates (review) that must not
// mint players on their 403 path.
export async function getPlayerId(): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (!existing) return null;
  const verified = verifyPlayerCookie(existing);
  if (verified) return verified;
  if (!existing.includes(".")) {
    const supabase = await createClient();
    const { data } = await supabase.from("players").select("id").eq("id", existing).single();
    if (data) return existing;
  }
  return null;
}

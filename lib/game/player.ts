import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const COOKIE = "arena_player_id";

// Anonymous identity via cookie (no login in v1).
export async function getOrCreatePlayerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  const supabase = await createClient();
  if (existing) {
    const { data } = await supabase.from("players").select("id").eq("id", existing).single();
    if (data) return existing;
  }
  const { data, error } = await supabase.from("players").insert({}).select("id").single();
  if (error || !data) throw new Error("Could not create player.");
  store.set(COOKIE, (data as { id: string }).id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return (data as { id: string }).id;
}

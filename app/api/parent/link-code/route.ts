// POST /api/parent/link-code — child device: mint (or replace) a single-use link code.
// Identity comes from the arena_player_id cookie (no body needed).
// One active code per child: old unclaimed codes are revoked.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes

function newCode(): string {
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function POST() {
  try {
    const childId = await getOrCreatePlayerId();
    const db = await createClient();
    await db.from("parent_links").delete().eq("child_id", childId).is("parent_id", null);
    const { data, error } = await db
      .from("parent_links")
      .insert({ code: newCode(), child_id: childId })
      .select("code")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ code: (data as { code: string }).code });
  } catch {
    return NextResponse.json(
      { error: "Parent linking needs a database update (migration 0005).", needsMigration: true },
      { status: 503 },
    );
  }
}

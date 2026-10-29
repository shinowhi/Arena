import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";

export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const { data } = await supabase.from("players").select("xp").eq("id", playerId).single();
    return NextResponse.json({ id: playerId, xp: (data as { xp: number } | null)?.xp ?? 0 });
  } catch {
    return NextResponse.json({ error: "Could not load player." }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // Minting endpoint: IP bucket first so fresh-cookie loops cannot mint
  // unlimited player rows.
  const rl = checkRate(`player:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const { data } = await supabase.from("players").select("xp").eq("id", playerId).single();
    return NextResponse.json({ id: playerId, xp: (data as { xp: number } | null)?.xp ?? 0 });
  } catch {
    return NextResponse.json({ error: "Could not load player." }, { status: 500 });
  }
}
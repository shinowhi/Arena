import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { getBalance } from "@/lib/billing/xu";

// Xu balance: GET -> {balance}. Read-only: uses getPlayerId (never mints a
// player) and returns 0 for unknown visitors.
export async function GET() {
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) return NextResponse.json({ balance: 0 });
  try {
    const supabase = await createClient();
    return NextResponse.json({ balance: await getBalance(supabase, playerId) });
  } catch {
    return NextResponse.json({ balance: 0 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { logFunnel } from "@/lib/funnel";

// Joins a lobby (idempotent). Cap 8; over-cap race accepted for the demo.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad room id." }, { status: 400 });
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    // Race-safe DB join (row-locked cap). Missing function = migration unrun.
    const rpc = await supabase.rpc("join_room", { p_room: id, p_player: playerId });
    if (rpc.error) {
      const msg = (rpc.error as { message?: string }).message ?? "";
      const code = (rpc.error as { code?: string }).code ?? "";
      if (msg.includes("Could not find") || msg.includes("does not exist") || code === "42P01" || code === "PGRST202") {
        return NextResponse.json({ error: "Royale tables missing.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: "Join failed — retry." }, { status: 500 });
    }
    if (rpc.data === "missing") return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (rpc.data === "started") return NextResponse.json({ error: "Room already started." }, { status: 409 });
    if (rpc.data === "full") return NextResponse.json({ error: "Room is full." }, { status: 409 });
    await logFunnel(supabase, playerId, "royale_joined");
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Join failed — retry." }, { status: 500 });
  }
}

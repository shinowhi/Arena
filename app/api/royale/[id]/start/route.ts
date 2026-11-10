import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { ROUND_SECONDS } from "@/lib/game/royale";

// Starts the room (creator only, 2+ players): lobby → live, round 0 opens.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad room id." }, { status: 400 });
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const room = await supabase.from("exam_rooms").select("status, creator_player_id").eq("id", id).maybeSingle();
    if (room.error || !room.data) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    const r = room.data as { status: string; creator_player_id: string };
    if (r.creator_player_id !== playerId) return NextResponse.json({ error: "Only the creator starts." }, { status: 403 });
    if (r.status !== "lobby") return NextResponse.json({ error: "Already started." }, { status: 409 });
    const count = await supabase.from("exam_room_players").select("player_id", { count: "exact", head: true }).eq("room_id", id);
    if ((count.count ?? 0) < 2) return NextResponse.json({ error: "Need at least 2 players." }, { status: 409 });
    const now = Date.now();
    const upd = await supabase
      .from("exam_rooms")
      .update({
        status: "live",
        round: 0,
        round_started_at: new Date(now).toISOString(),
        round_ends_at: new Date(now + ROUND_SECONDS * 1000).toISOString(),
      })
      .eq("id", id)
      .eq("status", "lobby");
    if (upd.error) return NextResponse.json({ error: "Start failed — retry." }, { status: 500 });
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Start failed — retry." }, { status: 500 });
  }
}

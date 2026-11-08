import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { loadPvpRoom } from "@/lib/game/pvp-room";
import { PVP_MAX_FIGHTERS, PvpSide } from "@/lib/game/pvp";

const Body = z.object({ side: PvpSide });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick side A or B." }, { status: 400 });
  try {
    const playerId = await getOrCreatePlayerId();
    const r = await loadPvpRoom(id, playerId);
    if (r.missingTable) return NextResponse.json({ error: "PVP unlocks after migration 0008." }, { status: 503 });
    if (!r.view) return NextResponse.json({ error: r.error ?? "Room lookup failed." }, { status: r.status ?? 500 });
    if (r.view.finished || r.view.status !== "ALIVE") {
      return NextResponse.json({ error: "Room is closed." }, { status: 410 });
    }
    // Idempotent same-side claim; switching sides is refused.
    if (r.view.your_side) {
      if (r.view.your_side === parsed.data.side) return NextResponse.json({ side: r.view.your_side });
      return NextResponse.json({ error: "Side locked — you fight for " + r.view.your_side + "." }, { status: 409 });
    }
    if (r.view.fighters.length >= PVP_MAX_FIGHTERS) {
      return NextResponse.json({ error: "Room is full." }, { status: 409 });
    }
    const supabase = await createClient();
    const { error } = await supabase.from("pvp_sides").insert({ room_id: id, player_id: playerId, side: parsed.data.side });
    if (error) return NextResponse.json({ error: "Claim failed — retry." }, { status: 500 });
    return NextResponse.json({ side: parsed.data.side });
  } catch {
    return NextResponse.json({ error: "Claim failed — retry." }, { status: 500 });
  }
}

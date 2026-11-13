import { NextResponse } from "next/server";
import { getPlayerId } from "@/lib/game/player";
import { loadPvpRoom } from "@/lib/game/pvp-room";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    // SECURITY PHASE-1: spectators never mint a player. "" matches no side
    // claim, so null players get the spectator view (claim POST mints).
    const playerId = await getPlayerId();
    const r = await loadPvpRoom(id, playerId ?? "");
    if (r.missingTable) return NextResponse.json({ error: "PVP unlocks after migration 0008." }, { status: 503 });
    if (!r.view) return NextResponse.json({ error: r.error ?? "Room lookup failed." }, { status: r.status ?? 500 });
    return NextResponse.json(r.view);
  } catch {
    return NextResponse.json({ error: "Room lookup failed — retry." }, { status: 500 });
  }
}

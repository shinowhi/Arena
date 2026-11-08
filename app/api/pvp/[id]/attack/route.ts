import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { loadPvpRoom } from "@/lib/game/pvp-room";

const Body = z.object({ question_index: z.number().int().min(0).max(4), answer: z.number().finite() });

type RowQ = { answer_numeric: number; tolerance: number };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  try {
    const playerId = await getOrCreatePlayerId();
    const r = await loadPvpRoom(id, playerId);
    if (r.missingTable) return NextResponse.json({ error: "PVP unlocks after migration 0008." }, { status: 503 });
    if (!r.view) return NextResponse.json({ error: r.error ?? "Room lookup failed." }, { status: r.status ?? 500 });
    if (r.view.finished || r.view.status !== "ALIVE") {
      return NextResponse.json({ error: "Room is closed.", finished: true }, { status: 410 });
    }
    if (!r.view.your_side) return NextResponse.json({ error: "Claim a side first." }, { status: 403 });
    const supabase = await createClient();
    const { data } = await supabase.from("bosses").select("questions").eq("id", id).single();
    const q = ((data as { questions: RowQ[] } | null)?.questions ?? [])[parsed.data.question_index];
    if (!q) return NextResponse.json({ error: "Bad question index." }, { status: 400 });
    const correct = Math.abs(q.answer_numeric - parsed.data.answer) <= Math.max(q.tolerance, 1e-6);
    const { error: atkErr } = await supabase.from("attacks").insert({
      boss_id: id,
      player_id: playerId,
      question_index: parsed.data.question_index,
      correct,
      damage: 0,
    });
    if (atkErr) return NextResponse.json({ error: "Attack failed — retry." }, { status: 500 });
    const after = await loadPvpRoom(id, playerId);
    return NextResponse.json({ correct, room: after.view ?? null });
  } catch {
    return NextResponse.json({ error: "Attack failed — retry." }, { status: 500 });
  }
}

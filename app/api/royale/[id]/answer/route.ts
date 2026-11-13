import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { advanceRoom, readRoom } from "@/lib/game/royale-advance";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

const Body = z.object({ answer: z.number().int().min(0).max(3) });

// Answers the CURRENT round (one per round, conditional write). Correct →
// score+1; wrong → out immediately. Round clock enforced via advance-first.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad room id." }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing answer." }, { status: 400 });
  const ipRl = checkRate(`royale-answer:ip:${getClientIp(req)}`, 30, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const playerId = await getOrCreatePlayerId();
    const rl = checkRate(`royale-answer:${playerId}`, 30, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const st = await advanceRoom(supabase, id, Date.now()).catch(() => null);
    if (!st) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    if (st.room.status !== "live") return NextResponse.json({ error: "Room is not live." }, { status: 409 });
    const me = st.players.find((p) => p.player_id === playerId);
    if (!me) return NextResponse.json({ error: "Not in this room." }, { status: 403 });
    if (!me.alive) return NextResponse.json({ error: "You are out." }, { status: 409 });
    if (me.answered >= st.room.round) return NextResponse.json({ error: "Already answered." }, { status: 409 });
    const q = st.room.paper[st.room.round];
    if (!q) return NextResponse.json({ error: "Round closed — reload." }, { status: 409 });
    const correct = parsed.data.answer === q.answer_index;
    const started = st.room.round_started_at ? new Date(st.room.round_started_at).getTime() : Date.now();
    const ms = Math.max(0, Date.now() - (Number.isFinite(started) ? started : Date.now()));
    const upd = await supabase
      .from("exam_room_players")
      .update({ answered: st.room.round, last_ms: ms, score: me.score + (correct ? 1 : 0), alive: correct })
      .eq("room_id", id)
      .eq("player_id", playerId)
      .eq("alive", true)
      .lt("answered", st.room.round)
      .select("player_id");
    if (upd.error) return NextResponse.json({ error: "Answer failed — retry." }, { status: 500 });
    if (!upd.data || upd.data.length === 0) {
      return NextResponse.json({ error: "Round closed — reload." }, { status: 409 });
    }
    const re = await readRoom(supabase, id);
    const mine = re?.players.find((p) => p.player_id === playerId);
    return NextResponse.json({ correct, alive: mine?.alive ?? false, score: mine?.score ?? me.score });
  } catch {
    return NextResponse.json({ error: "Answer failed — retry." }, { status: 500 });
  }
}

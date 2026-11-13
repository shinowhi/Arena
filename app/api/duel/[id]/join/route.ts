import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { DuelRow } from "@/lib/game/duel";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Joins a waiting duel as p2 (waiting → live). Idempotent for p2.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Bad duel id." }, { status: 400 });
  const ipRl = checkRate(`duel-join:ip:${getClientIp(req)}`, 30, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const playerId = await getOrCreatePlayerId();
    const rl = checkRate(`duel-join:${playerId}`, 30, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const got = await supabase.from("exam_duels").select("*").eq("id", id).maybeSingle();
    if (got.error) {
      if ((got.error as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Duel tables missing.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: "Join failed — retry." }, { status: 500 });
    }
    if (!got.data) return NextResponse.json({ error: "Duel not found." }, { status: 404 });
    const duel = DuelRow.safeParse(got.data);
    if (!duel.success) return NextResponse.json({ error: "Join failed — retry." }, { status: 500 });
    const d = duel.data;
    if (d.status === "finished") return NextResponse.json({ error: "Duel already finished." }, { status: 409 });
    if (d.p1_player_id === playerId) return NextResponse.json({ error: "That's your own duel." }, { status: 409 });
    if (d.p2_player_id === playerId) return NextResponse.json({ id });
    if (d.p2_player_id) return NextResponse.json({ error: "Duel is full." }, { status: 409 });
    // Race-safe claim: only the first writer lands the seat.
    const upd = await supabase
      .from("exam_duels")
      .update({ p2_player_id: playerId, status: "live" })
      .eq("id", id)
      .is("p2_player_id", null)
      .select("id");
    if (upd.error) return NextResponse.json({ error: "Join failed — retry." }, { status: 500 });
    if (!upd.data || upd.data.length === 0) {
      const re = await supabase.from("exam_duels").select("p2_player_id").eq("id", id).single();
      if ((re.data as { p2_player_id: string } | null)?.p2_player_id === playerId) return NextResponse.json({ id });
      return NextResponse.json({ error: "Duel is full." }, { status: 409 });
    }
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Join failed — retry." }, { status: 500 });
  }
}

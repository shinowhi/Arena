import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { logFunnel } from "@/lib/funnel";
import { DAMAGE_PER_HIT } from "@/lib/game/boss-rules";

const Body = z.object({ question_index: z.number().int().min(0).max(4), answer: z.number() });

type BossRow = {
  current_hp: number;
  max_hp: number;
  status: string;
  despawn_at: string;
  owner_player_id: string | null;
  questions: Array<{ answer_numeric: number; tolerance: number }>;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const supabase = await createClient();
  // Player lookup and boss fetch are independent: overlap them.
  const [playerId, bossRes] = await Promise.all([
    getOrCreatePlayerId(),
    supabase.from("bosses").select("*").eq("id", id).single(),
  ]);
  const { data } = bossRes;
  if (!data) return NextResponse.json({ error: "Boss not found." }, { status: 404 });
  const b = data as BossRow;
  if (b.status !== "ALIVE" || Date.now() > new Date(b.despawn_at).getTime()) {
    return NextResponse.json({ error: "Boss is no longer alive.", status: b.status }, { status: 410 });
  }
  if (b.owner_player_id && b.owner_player_id !== playerId) {
    return NextResponse.json({ error: "Not your boss." }, { status: 403 });
  }
  const q = b.questions[parsed.data.question_index];
  if (!q) return NextResponse.json({ error: "Bad question index." }, { status: 400 });
  const correct = Math.abs(q.answer_numeric - parsed.data.answer) <= Math.max(q.tolerance, 1e-6);
  const damage = correct ? DAMAGE_PER_HIT : 0;
  await supabase.from("attacks").insert({
    boss_id: id,
    player_id: playerId,
    question_index: parsed.data.question_index,
    correct,
    damage,
  });
  if (correct) {
    try {
      // Raid feed is best-effort: never break the attack (table lands in migration 0004).
      await supabase.from("raid_hits").insert({ boss_id: id, player_id: playerId, damage });
    } catch {}
  }
  let hp = b.current_hp;
  let status = b.status;
  if (correct) {
    const { data: rows } = await supabase.rpc("attack_boss", { p_boss_id: id, p_damage: damage });
    const row = (Array.isArray(rows) ? rows[0] : rows) as { current_hp: number; status: string } | null;
    if (row) {
      hp = row.current_hp;
      status = row.status;
    }
  }
  if (status !== "ALIVE") await logFunnel(supabase, playerId, "boss_killed");
  return NextResponse.json({ correct, damage, current_hp: hp, max_hp: b.max_hp, status });
}

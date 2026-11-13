import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";

type Q = { level: number; prompt_latex: string; hint: string; answer_numeric: number; tolerance: number };
type BossRow = {
  id: string;
  skill_tag: string;
  current_hp: number;
  max_hp: number;
  status: string;
  despawn_at: string;
  owner_player_id: string | null;
  rarity: string;
  questions: Q[];
};

// Public boss view. Never sends correct answers to the client.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  // Player lookup and boss fetch are independent: overlap them.
  // SECURITY PHASE-1: read-only lookup — spectators never mint a player.
  // Null players fail the owner check below (correct: no proof of ownership)
  // and see no personal progress on public bosses.
  const [playerId, bossRes] = await Promise.all([
    getPlayerId(),
    supabase.from("bosses").select("*").eq("id", id).single(),
  ]);
  const { data } = bossRes;
  if (!data) return NextResponse.json({ error: "Boss not found." }, { status: 404 });
  const b = data as BossRow;
  if (b.owner_player_id && b.owner_player_id !== playerId) {
    return NextResponse.json({ error: "Not your boss." }, { status: 403 });
  }
  let correct_indices: number[] = [];
  if (playerId) {
    const { data: atk } = await supabase
      .from("attacks")
      .select("question_index")
      .eq("boss_id", id)
      .eq("player_id", playerId)
      .eq("correct", true);
    correct_indices = ((atk ?? []) as Array<{ question_index: number }>).map((r) => r.question_index);
  }
  return NextResponse.json({
    id: b.id,
    skill_tag: b.skill_tag,
    current_hp: b.current_hp,
    max_hp: b.max_hp,
    status: b.status,
    rarity: b.rarity,
    despawn_at: b.despawn_at,
    correct_indices,
    verified_count: b.questions.length,
    questions: b.questions.map((q) => ({ level: q.level, prompt_latex: q.prompt_latex, hint: q.hint })),
  });
}

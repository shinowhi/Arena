import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";

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
  const playerId = await getOrCreatePlayerId();
  const { data } = await supabase.from("bosses").select("*").eq("id", id).single();
  if (!data) return NextResponse.json({ error: "Boss not found." }, { status: 404 });
  const b = data as BossRow;
  if (b.owner_player_id && b.owner_player_id !== playerId) {
    return NextResponse.json({ error: "Not your boss." }, { status: 403 });
  }
  const { data: atk } = await supabase
    .from("attacks")
    .select("question_index")
    .eq("boss_id", id)
    .eq("player_id", playerId)
    .eq("correct", true);
  const correct_indices = ((atk ?? []) as Array<{ question_index: number }>).map((r) => r.question_index);
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

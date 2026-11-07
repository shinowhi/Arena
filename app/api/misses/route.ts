import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { isValidSkill } from "@/lib/graph/skills";
import { toMissItems } from "@/lib/agents/misses";

export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("attacks")
      .select("boss_id, question_index, created_at, bosses!inner(skill_tag, questions)")
      .eq("player_id", playerId)
      .eq("correct", false)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error || !data) return NextResponse.json({ error: "Miss queue failed — retry." }, { status: 500 });
    const rows = (
      data as Array<{
        boss_id: string;
        question_index: number;
        created_at: string;
        bosses: { skill_tag: string; questions: [] } | Array<{ skill_tag: string; questions: [] }>;
      }>
    )
      .map((r) => {
        const b = Array.isArray(r.bosses) ? r.bosses[0] : r.bosses;
        return { boss_id: r.boss_id, question_index: r.question_index, created_at: r.created_at, skill_tag: b?.skill_tag ?? "", questions: b?.questions ?? [] };
      })
      .filter((r) => isValidSkill(r.skill_tag) || r.skill_tag === "gauntlet");
    return NextResponse.json({ items: toMissItems(rows) });
  } catch {
    return NextResponse.json({ error: "Miss queue failed — retry." }, { status: 500 });
  }
}

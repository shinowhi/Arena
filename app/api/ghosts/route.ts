import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { skillName } from "@/lib/graph/skills";

const ACTIVE_MINUTES = 15;
const NIGHTLY_GOAL = 200;

// Anonymous presence: how many OTHER players were active in the last 15 min,
// which skills glow right now, and tonight's shared solve count. No names,
// no ids, no PII — aggregates only. Zero migration.
export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const activeSince = new Date(Date.now() - ACTIVE_MINUTES * 60000).toISOString();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [{ data: recent }, { data: tonight }] = await Promise.all([
      supabase
        .from("attacks")
        .select("player_id, bosses(skill_tag)")
        .eq("correct", true)
        .gte("created_at", activeSince)
        .limit(500),
      supabase
        .from("attacks")
        .select("id")
        .eq("correct", true)
        .gte("created_at", dayStart.toISOString())
        .limit(5000),
    ]);
    type Row = { player_id: string; bosses: { skill_tag: string } | null };
    const others = ((recent as Row[] | null) ?? []).filter((r) => r.player_id !== playerId);
    const ghosts = new Set(others.map((r) => r.player_id)).size;
    const heat = new Map<string, number>();
    for (const r of others) {
      const tag = r.bosses?.skill_tag;
      if (tag) heat.set(tag, (heat.get(tag) ?? 0) + 1);
    }
    const hotSkills = [...heat.entries()]
      .map(([tag, count]) => ({ tag, name: skillName(tag), count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 8);
    const solved = ((tonight as Array<{ id: string }> | null) ?? []).length;
    return NextResponse.json({ ghosts, hotSkills, solvedTonight: solved, nightlyGoal: NIGHTLY_GOAL });
  } catch {
    return NextResponse.json({ error: "Could not load ghosts." }, { status: 500 });
  }
}

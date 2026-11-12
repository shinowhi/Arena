import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { skillName } from "@/lib/graph/skills";

const ACTIVE_MINUTES = 15;
const NIGHTLY_GOAL = 200;
const FEED_LIMIT = 12;

// Anonymous presence: how many OTHER players were active in the last 15 min,
// which skills glow right now, tonight's shared solve count, a pseudonymous
// live feed (skill + relative minutes, no ids/names), and whether the caller
// solved tonight. Identity is read-only (getPlayerId NEVER mints a player
// row or sets a cookie). No PII — aggregates only. Zero migration.
export async function GET() {
  try {
    const playerId = await getPlayerId();
    const supabase = await createClient();
    const activeSince = new Date(Date.now() - ACTIVE_MINUTES * 60000).toISOString();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayStartISO = dayStart.toISOString();
    const [{ data: recent }, { data: tonight }, { data: feed }, { data: mine }] = await Promise.all([
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
        .gte("created_at", dayStartISO)
        .limit(5000),
      supabase
        .from("attacks")
        .select("created_at, bosses(skill_tag)")
        .eq("correct", true)
        .gte("created_at", dayStartISO)
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT),
      playerId
        ? supabase
            .from("attacks")
            .select("id")
            .eq("player_id", playerId)
            .eq("correct", true)
            .gte("created_at", dayStartISO)
            .limit(1)
        : Promise.resolve({ data: null as Array<{ id: string }> | null }),
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
    type FeedRow = { created_at: string; bosses: { skill_tag: string } | null };
    const now = Date.now();
    const feedItems = ((feed as FeedRow[] | null) ?? [])
      .map((r) => {
        const tag = r.bosses?.skill_tag;
        if (!tag) return null;
        const minutesAgo = Math.max(0, Math.round((now - new Date(r.created_at).getTime()) / 60000));
        return { skillTag: tag, skillName: skillName(tag), minutesAgo };
      })
      .filter((x): x is { skillTag: string; skillName: string; minutesAgo: number } => x !== null);
    const youTonight = ((mine as Array<{ id: string }> | null) ?? []).length > 0;
    return NextResponse.json({
      ghosts,
      hotSkills,
      solvedTonight: solved,
      nightlyGoal: NIGHTLY_GOAL,
      recent: feedItems,
      youTonight,
    });
  } catch {
    return NextResponse.json({ error: "Could not load ghosts." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { skillName } from "@/lib/graph/skills";

type AttackRow = { bosses: { skill_tag: string; status: string } | null };
type ScanRow = { weak_skill: string };

// Weakest-first ordering from YOUR scan history + healed set from slain bosses.
// Zero migration. No answers involved.
export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const [{ data: scans }, { data: attacks }] = await Promise.all([
      supabase.from("scans").select("weak_skill").eq("player_id", playerId).limit(1000),
      supabase
        .from("attacks")
        .select("bosses(skill_tag, status)")
        .eq("player_id", playerId)
        .eq("correct", true)
        .limit(2000),
    ]);
    const misses = new Map<string, number>();
    for (const s of ((scans as ScanRow[] | null) ?? [])) {
      misses.set(s.weak_skill, (misses.get(s.weak_skill) ?? 0) + 1);
    }
    const slain = new Set<string>();
    for (const a of ((attacks as AttackRow[] | null) ?? [])) {
      if (a.bosses?.status === "DEAD" && a.bosses.skill_tag) slain.add(a.bosses.skill_tag);
    }
    const weak = [...misses.entries()]
      .map(([tag, count]) => ({ tag, name: skillName(tag), misses: count, healed: slain.has(tag) }))
      .sort((x, y) => y.misses - x.misses);
    const healedWeak = weak.filter((w) => w.healed).length;
    return NextResponse.json({
      weak,
      totalWeak: weak.length,
      healedWeak,
      readiness: weak.length === 0 ? 100 : Math.round((healedWeak / weak.length) * 100),
    });
  } catch {
    return NextResponse.json({ error: "Could not load plan." }, { status: 500 });
  }
}

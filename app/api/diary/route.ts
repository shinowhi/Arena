import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { skillName } from "@/lib/graph/skills";

type AttackRow = {
  created_at: string;
  correct: boolean;
  bosses: { skill_tag: string; status: string } | null;
};

// Personal patch timeline, derived from attacks JOIN bosses. Zero migration.
// "Patched" = landed a correct hit on a boss of that skill that is now DEAD
// (world-boss kills you joined count too — you were there).
// "Fails" = wrong attacks on that skill before the first slain.
export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const { data } = await supabase
      .from("attacks")
      .select("created_at, correct, bosses(skill_tag, status)")
      .eq("player_id", playerId)
      .order("created_at", { ascending: true })
      .limit(2000);
    type Per = { fails: number; hits: number; slainAt: string | null };
    const per = new Map<string, Per>();
    for (const a of ((data as AttackRow[] | null) ?? [])) {
      const tag = a.bosses?.skill_tag;
      if (!tag) continue;
      const p = per.get(tag) ?? { fails: 0, hits: 0, slainAt: null };
      if (a.correct) {
        p.hits++;
        if (a.bosses?.status === "DEAD" && !p.slainAt) p.slainAt = a.created_at;
      } else if (!p.slainAt) {
        p.fails++;
      }
      per.set(tag, p);
    }
    const entries = [...per.entries()]
      .map(([tag, p]) => ({
        skill: tag,
        name: skillName(tag),
        fails: p.fails,
        hits: p.hits,
        slainAt: p.slainAt,
        patched: p.slainAt !== null,
      }))
      .sort((x, y) => {
        if (x.slainAt && y.slainAt) return y.slainAt < x.slainAt ? -1 : 1;
        if (x.slainAt) return -1;
        if (y.slainAt) return 1;
        return y.hits - x.hits;
      });
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ error: "Could not load diary." }, { status: 500 });
  }
}

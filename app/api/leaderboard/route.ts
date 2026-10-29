import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";

type AttackRow = {
  player_id: string;
  boss_id: string;
  bosses: { status: string } | null;
};

type PlayerRow = {
  id: string;
  display_name: string | null;
  xp: number;
};

export async function GET() {
  try {
    await getOrCreatePlayerId();
    const supabase = await createClient();
    // shortcut: in-JS aggregation capped at 1000 rows; move to a SQL RPC when attacks grow.
    const [{ data: attacks }, { data: players }] = await Promise.all([
      supabase.from("attacks").select("player_id, boss_id, bosses(status)").eq("correct", true).limit(1000),
      supabase.from("players").select("id, display_name, xp").limit(200),
    ]);
    const slain = new Map<string, Set<string>>();
    for (const a of ((attacks as AttackRow[] | null) ?? [])) {
      if (a.bosses?.status !== "DEAD") continue;
      const set = slain.get(a.player_id) ?? new Set<string>();
      set.add(a.boss_id);
      slain.set(a.player_id, set);
    }
    const leaders = ((players as PlayerRow[] | null) ?? [])
      .map((p) => ({
        id: p.id,
        name: p.display_name ?? "Hunter #" + p.id.slice(0, 4),
        xp: p.xp,
        level: Math.floor(p.xp / 100) + 1,
        bosses_slain: slain.get(p.id)?.size ?? 0,
      }))
      .sort((x, y) => y.bosses_slain - x.bosses_slain || y.xp - x.xp)
      .slice(0, 10);
    return NextResponse.json({ leaders });
  } catch {
    return NextResponse.json({ error: "Could not load leaderboard." }, { status: 500 });
  }
}
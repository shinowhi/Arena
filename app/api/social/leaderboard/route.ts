// GET /api/social/leaderboard — XP / streak / bosses slain among self + friends.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { getPlayerStats } from "@/lib/game/progress";
import { playerLabel } from "@/lib/social/rules";
import { friendIds, needSocialMigration } from "@/lib/social/server";

export async function GET() {
  try {
    // SECURITY PHASE-1: board reads never mint a player — no identity means
    // no rows (a fresh player has no stats or friends either).
    const me = await getPlayerId();
    if (!me) return NextResponse.json({ rows: [] });
    const db = await createClient();
    const ids = [me, ...(await friendIds(db, me))];
    const { data: players, error } = await db.from("players").select("id, display_name, xp").in("id", ids);
    if (error) throw error;
    const rows = await Promise.all(
      ((players ?? []) as { id: string; display_name?: unknown; xp?: unknown }[]).map(async (p) => {
        const stats = await getPlayerStats(db, p.id);
        return {
          id: p.id,
          label: playerLabel(p.id, p.display_name),
          you: p.id === me,
          xp: typeof p.xp === "number" ? p.xp : 0,
          streak: stats.streakDays,
          bosses: stats.skillsSlain,
        };
      }),
    );
    rows.sort((a, b) => b.xp - a.xp);
    return NextResponse.json({ rows });
  } catch {
    return needSocialMigration();
  }
}

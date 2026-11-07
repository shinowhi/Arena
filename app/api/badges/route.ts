import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { Badge, countBadgeStats, evaluateBadges } from "@/lib/game/badges";

const WEEK_MS = 7 * 24 * 3600 * 1000;

export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    const [scansRes, attacksRes, bossesRes] = await Promise.all([
      supabase
        .from("scans")
        .select("created_at")
        .eq("player_id", playerId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("attacks")
        .select("created_at, correct, boss_id, question_index")
        .eq("player_id", playerId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("bosses")
        .select("id")
        .eq("owner_player_id", playerId)
        .eq("status", "DEAD")
        .gte("spawn_at", since)
        .limit(50),
    ]);
    if (scansRes.error || attacksRes.error || bossesRes.error) {
      return NextResponse.json({ error: "Badges failed — retry." }, { status: 500 });
    }
    const scans = (scansRes.data ?? []) as Array<{ created_at: string }>;
    const attacks = (attacksRes.data ?? []) as Array<{
      created_at: string;
      correct: boolean;
      boss_id: string;
      question_index: number;
    }>;
    const bosses = (bossesRes.data ?? []) as Array<{ id: string }>;
    const badges = evaluateBadges(countBadgeStats(attacks, scans, bosses.length));
    return NextResponse.json({ week_start: since, badges: badges.map((b) => Badge.parse(b)) });
  } catch {
    return NextResponse.json({ error: "Badges failed — retry." }, { status: 500 });
  }
}

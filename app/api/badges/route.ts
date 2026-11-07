import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { Badge, evaluateBadges } from "@/lib/game/badges";

const WEEK_MS = 7 * 24 * 3600 * 1000;

export async function GET() {
  const playerId = await getOrCreatePlayerId();
  const supabase = await createClient();
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const [scansRes, attacksRes, bossesRes] = await Promise.all([
    supabase.from("scans").select("created_at").eq("player_id", playerId).gte("created_at", since).limit(200),
    supabase
      .from("attacks")
      .select("created_at, correct, boss_id")
      .eq("player_id", playerId)
      .gte("created_at", since)
      .limit(1000),
    supabase
      .from("bosses")
      .select("id")
      .eq("owner_player_id", playerId)
      .eq("status", "DEAD")
      .gte("spawn_at", since)
      .limit(50),
  ]);
  const scans = (scansRes.data ?? []) as Array<{ created_at: string }>;
  const attacks = (attacksRes.data ?? []) as Array<{ created_at: string; correct: boolean; boss_id: string }>;
  const bosses = (bossesRes.data ?? []) as Array<{ id: string }>;
  const days = new Set<string>();
  for (const r of scans) days.add(r.created_at.slice(0, 10));
  for (const r of attacks) days.add(r.created_at.slice(0, 10));
  const perBoss = new Map<string, number>();
  let correctHits = 0;
  for (const a of attacks) {
    if (!a.correct) continue;
    correctHits += 1;
    perBoss.set(a.boss_id, (perBoss.get(a.boss_id) ?? 0) + 1);
  }
  let bestBossCorrect = 0;
  for (const n of perBoss.values()) bestBossCorrect = Math.max(bestBossCorrect, n);
  const badges = evaluateBadges({
    scans: scans.length,
    correctHits,
    activeDays: days.size,
    slain: bosses.length,
    bestBossCorrect,
  });
  return NextResponse.json({ week_start: since, badges: badges.map((b) => Badge.parse(b)) });
}

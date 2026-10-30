import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";

type Row = { created_at: string };

const WINDOW_DAYS = 120;

// A day counts when the player logs >=1 correct attack or >=1 scan.
// Zero migration: derived from attacks/scans created_at only. No answers involved.
export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const since = new Date(Date.now() - (WINDOW_DAYS + 10) * 86400000).toISOString();
    const [{ data: attacks }, { data: scans }] = await Promise.all([
      supabase
        .from("attacks")
        .select("created_at")
        .eq("player_id", playerId)
        .eq("correct", true)
        .gte("created_at", since)
        .limit(2000),
      supabase
        .from("scans")
        .select("created_at")
        .eq("player_id", playerId)
        .gte("created_at", since)
        .limit(500),
    ]);
    const days = new Map<string, number>();
    for (const r of [...((attacks as Row[] | null) ?? []), ...((scans as Row[] | null) ?? [])]) {
      const key = r.created_at.slice(0, 10);
      days.set(key, (days.get(key) ?? 0) + 1);
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const heatmap: Array<{ date: string; count: number }> = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      const key = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
      heatmap.push({ date: key, count: days.get(key) ?? 0 });
    }
    let streak = 0;
    const cursor = new Date(today.getTime());
    if (!days.has(cursor.toISOString().slice(0, 10))) {
      cursor.setTime(cursor.getTime() - 86400000); // today idle: streak survives from yesterday
    }
    while (days.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setTime(cursor.getTime() - 86400000);
    }
    return NextResponse.json({ streak, totalActive: days.size, heatmap });
  } catch {
    return NextResponse.json({ error: "Could not load streak." }, { status: 500 });
  }
}

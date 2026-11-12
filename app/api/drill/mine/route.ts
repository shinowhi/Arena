import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";

type SetRow = { id: string; title: string; source: string; created_at: string };
type AttemptRow = { set_id: string; correct: boolean; created_at: string };

// Recent drill sets with aggregate accuracy. Read-only identity: unknown
// visitors get an empty list WITHOUT minting a player row.
export async function GET() {
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) return NextResponse.json({ sets: [] });
  const supabase = await createClient();
  const { data: sets, error } = await supabase
    .from("drill_sets")
    .select("id, title, source, created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !sets) {
    return NextResponse.json({ error: "Could not load your drill sets — retry." }, { status: 500 });
  }
  // Score is best-effort analytics: a failed attempts read still lists sets.
  // Latest attempt only: rows from one submit share one created_at (single
  // statement), so the max timestamp per set IS the newest attempt batch.
  const { data: attempts } = await supabase
    .from("paper_attempts")
    .select("set_id, correct, created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(2000);
  const rows = (attempts as AttemptRow[] | null) ?? [];
  const newest = new Map<string, string>();
  for (const a of rows) {
    if (!newest.has(a.set_id)) newest.set(a.set_id, a.created_at);
  }
  const bySet = new Map<string, { right: number; total: number }>();
  for (const a of rows) {
    if (a.created_at !== newest.get(a.set_id)) continue;
    const s = bySet.get(a.set_id) ?? { right: 0, total: 0 };
    s.total += 1;
    if (a.correct) s.right += 1;
    bySet.set(a.set_id, s);
  }
  return NextResponse.json({
    sets: (sets as SetRow[]).map((s) => {
      const agg = bySet.get(s.id);
      return {
        id: s.id,
        title: s.title,
        source: s.source,
        created: s.created_at,
        ...(agg && agg.total > 0 ? { score: Math.round((agg.right / agg.total) * 100) } : {}),
      };
    }),
  });
}

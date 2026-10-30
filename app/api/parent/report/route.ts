// GET /api/parent/report — role-aware parent report (identity from cookie).
// - parent device (this id claimed a code) -> { role: "parent", stats of child }
// - child device with claimed code        -> { role: "child", linked: true, stats of self }
// - child device with pending code        -> { role: "child", linked: false, stats of self }
// - nobody                                -> { role: "none", stats of self }
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { getPlayerStats } from "@/lib/game/progress";

export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const db = await createClient();
    const { data: asParent, error: e1 } = await db
      .from("parent_links")
      .select("child_id")
      .eq("parent_id", playerId)
      .maybeSingle();
    if (e1) throw e1;
    if (asParent) {
      const childId = (asParent as { child_id: string }).child_id;
      const stats = await getPlayerStats(db, childId);
      return NextResponse.json({ role: "parent", stats });
    }
    const { data: asChild, error: e2 } = await db
      .from("parent_links")
      .select("parent_id")
      .eq("child_id", playerId)
      .maybeSingle();
    if (e2) throw e2;
    const stats = await getPlayerStats(db, playerId);
    if (!asChild) return NextResponse.json({ role: "none", stats });
    const linked = Boolean((asChild as { parent_id: string | null }).parent_id);
    return NextResponse.json({ role: "child", linked, stats });
  } catch {
    return NextResponse.json(
      { error: "Parent linking needs a database update (migration 0005).", needsMigration: true },
      { status: 503 },
    );
  }
}

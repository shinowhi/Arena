import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { DrillPaper, stripDrillPaper } from "@/lib/drill/paper";

type DrillRow = {
  id: string;
  player_id: string;
  title: string;
  source: string;
  skill_tags: string[];
  paper: unknown;
};

// Stripped drill paper: prompts without keys AND without check specs (the
// submit route grades server-side). Read-only identity: unknown players get
// 403 WITHOUT minting a player row.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) return NextResponse.json({ error: "Not your drill set." }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drill_sets")
    .select("id, player_id, title, source, skill_tags, paper")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Drill set not found." }, { status: 404 });
  const row = data as DrillRow;
  if (row.player_id !== playerId) {
    return NextResponse.json({ error: "Not your drill set." }, { status: 403 });
  }
  const paper = DrillPaper.safeParse(row.paper);
  if (!paper.success) {
    return NextResponse.json({ error: "Drill set is corrupted — start a new one." }, { status: 500 });
  }
  return NextResponse.json({
    id: row.id,
    title: row.title,
    source: row.source,
    skill_tags: row.skill_tags,
    count: paper.data.questions.length,
    ...stripDrillPaper(paper.data),
  });
}

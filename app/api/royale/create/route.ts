import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { examConfig, ExamQuestion, EXAM_SET_VERSION } from "@/lib/agents/exam";
import { ROYALE_QUESTIONS } from "@/lib/game/royale";

const Body = z.object({ exam: z.enum(["vact", "hsa"]), section: z.string().min(1).max(64) });

// Creates a lobby with a 10Q paper snapshot (keys server-side only).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing exam or section." }, { status: 400 });
  const config = examConfig(parsed.data.exam);
  const sec = config?.sections.find((s) => s.id === parsed.data.section);
  if (!config || !sec) return NextResponse.json({ error: "Unknown section." }, { status: 404 });
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const row = await supabase
      .from("boss_question_cache")
      .select("questions")
      .eq("set_version", EXAM_SET_VERSION)
      .eq("skill_tag", sec.id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const qs = z.array(ExamQuestion).safeParse((row.data as { questions: unknown } | null)?.questions);
    if (row.error || !qs.success || qs.data.length < ROYALE_QUESTIONS) {
      return NextResponse.json({ error: "Section not primed yet." }, { status: 503 });
    }
    const ins = await supabase
      .from("exam_rooms")
      .insert({
        exam: config.id,
        section_id: sec.id,
        paper: qs.data.slice(0, ROYALE_QUESTIONS),
        creator_player_id: playerId,
      })
      .select("id")
      .single();
    if (ins.error) {
      if ((ins.error as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Royale tables missing.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: "Create failed — retry." }, { status: 500 });
    }
    const id = (ins.data as { id: string }).id;
    const mem = await supabase.from("exam_room_players").insert({ room_id: id, player_id: playerId });
    if (mem.error) {
      await supabase.from("exam_rooms").delete().eq("id", id);
      return NextResponse.json({ error: "Create failed — retry." }, { status: 500 });
    }
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Create failed — retry." }, { status: 500 });
  }
}

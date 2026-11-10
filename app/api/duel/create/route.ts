import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { examConfig, ExamQuestion, EXAM_SET_VERSION } from "@/lib/agents/exam";

const Body = z.object({ exam: z.enum(["vact", "hsa"]), section: z.string().min(1).max(64) });

// Creates a waiting duel over ONE cached section, paper pinned by as_of.
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
      .select("questions, fetched_at")
      .eq("set_version", EXAM_SET_VERSION)
      .eq("skill_tag", sec.id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row.error || !row.data) return NextResponse.json({ error: "Section not primed yet." }, { status: 503 });
    const data = row.data as { questions: unknown; fetched_at: string };
    const qs = z.array(ExamQuestion).safeParse(data.questions);
    if (!qs.success || qs.data.length < sec.count) {
      return NextResponse.json({ error: "Section not primed yet." }, { status: 503 });
    }
    // Snapshot the paper (keys included, server-side only): the duel can never
    // leak via review/cache reads nor void on refresh.
    const ins = await supabase
      .from("exam_duels")
      .insert({
        exam: config.id,
        section_id: sec.id,
        set_as_of: data.fetched_at,
        paper: qs.data.slice(0, sec.count),
        p1_player_id: playerId,
      })
      .select("id")
      .single();
    if (ins.error) {
      if ((ins.error as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Duel tables missing.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: "Create failed — retry." }, { status: 500 });
    }
    return NextResponse.json({ id: (ins.data as { id: string }).id });
  } catch {
    return NextResponse.json({ error: "Create failed — retry." }, { status: 500 });
  }
}

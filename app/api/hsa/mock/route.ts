import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { logFunnel } from "@/lib/funnel";
import { assembleExam, CacheRow, ExamQuestion, EXAM_SET_VERSION, HSA_CONFIG } from "@/lib/agents/exam";

// HSA paper: fixed parts + ONE part-3 choice (science or english).
// ?p3=hsa_science (default) or ?p3=hsa_english. Zero LLM at serve time.
const Row = z.object({ skill_tag: z.string(), questions: z.array(ExamQuestion), fetched_at: z.string() });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const now = new Date();
    const day = url.searchParams.get("day") ?? now.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "Bad day param." }, { status: 400 });
    const p3 = url.searchParams.get("p3") ?? "hsa_science";
    if (p3 !== "hsa_science" && p3 !== "hsa_english") {
      return NextResponse.json({ error: "Bad p3 param (hsa_science or hsa_english)." }, { status: 400 });
    }
    const ids = HSA_CONFIG.sections.map((s) => s.id);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("boss_question_cache")
      .select("skill_tag, questions, fetched_at")
      .eq("set_version", EXAM_SET_VERSION)
      .in("skill_tag", ids);
    if (error || !data) return NextResponse.json({ error: "Mock failed — retry." }, { status: 500 });
    const rows: CacheRow[] = [];
    for (const r of data as unknown[]) {
      const p = Row.safeParse(r);
      if (p.success) rows.push(p.data);
    }
    try {
      const sections = assembleExam(rows, HSA_CONFIG, p3);
      // First-fetch stamp for the review gate (best-effort pre-migration).
      try {
        const playerId = await getOrCreatePlayerId();
        await logFunnel(supabase, playerId, "exam_started", { exam: "hsa" });
        await supabase.from("exam_attempts").upsert(
          { player_id: playerId, exam: "hsa", day, started_at: now.toISOString() },
          { onConflict: "player_id,exam,day", ignoreDuplicates: true },
        );
      } catch {
        // Pre-migration or DB hiccup: the mock still serves.
      }
      return NextResponse.json({
        exam: HSA_CONFIG.id,
        date: day,
        p3,
        total: sections.reduce((a, s) => a + s.questions.length, 0),
        sections,
      });
    } catch {
      return NextResponse.json({ error: "Warming up: this paper is still forging." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "Mock failed — retry." }, { status: 500 });
  }
}

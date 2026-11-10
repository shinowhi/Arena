import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  assembleReview,
  CacheRow,
  examConfig,
  ExamQuestion,
  EXAM_SET_VERSION,
} from "@/lib/agents/exam";

// Answer-key review: GET /api/exam/review?exam=vact&day=... (&p3=... for HSA).
// The UI calls this after the paper locks. Stateless demo: the server cannot
// prove the caller's clock expired, so a direct early fetch is possible —
// documented in SPEC-aptitude-exams.md, to gate post-judging.
const Row = z.object({ skill_tag: z.string(), questions: z.array(ExamQuestion), fetched_at: z.string() });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const examId = url.searchParams.get("exam") ?? "";
    const day = url.searchParams.get("day") ?? new Date().toISOString().slice(0, 10);
    const config = examConfig(examId);
    if (!config) return NextResponse.json({ error: "Bad exam param (vact or hsa)." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "Bad day param." }, { status: 400 });
    const p3 = url.searchParams.get("p3") ?? undefined;
    if (config.id === "hsa" && p3 !== "hsa_science" && p3 !== "hsa_english") {
      return NextResponse.json({ error: "Bad p3 param (hsa_science or hsa_english)." }, { status: 400 });
    }
    const ids = config.sections.map((s) => s.id);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("boss_question_cache")
      .select("skill_tag, questions, fetched_at")
      .eq("set_version", EXAM_SET_VERSION)
      .in("skill_tag", ids);
    if (error || !data) return NextResponse.json({ error: "Review failed — retry." }, { status: 500 });
    const rows: CacheRow[] = [];
    for (const r of data as unknown[]) {
      const p = Row.safeParse(r);
      if (p.success) rows.push(p.data);
    }
    try {
      const sections = assembleReview(rows, config, p3);
      return NextResponse.json({
        exam: config.id,
        date: day,
        total: sections.reduce((a, s) => a + s.questions.length, 0),
        scale: config.scale,
        pointsPerQ: config.pointsPerQ,
        sections,
      });
    } catch {
      return NextResponse.json({ error: "Warming up: this paper is still forging." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "Review failed — retry." }, { status: 500 });
  }
}

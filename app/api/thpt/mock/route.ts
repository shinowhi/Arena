import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { skillGrade, skillName, SKILL_IDS } from "@/lib/graph/skills";
import { buildMock, MockQuestion, THPT_CONFIG } from "@/lib/agents/thpt";

// Daily THPTQG mock: 50 questions from 25 cached sets (grades 10-12, no
// mechanics). Reads the 7-day cache window — verified questions never rot,
// so stale rows are fair game and the mock costs zero LLM.
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

// Grades 10-12 only: mechanics (14) and university-only calculus (13)
// live outside THPT math.
function poolSkills(): string[] {
  return SKILL_IDS.filter((id) => {
    const g = skillGrade(id);
    return g >= 10 && g <= 12;
  });
}

export async function GET(req: Request) {
  try {
    const day = new URL(req.url).searchParams.get("day") ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "Bad day param." }, { status: 400 });
    const pool = poolSkills();
    const supabase = await createClient();
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const { data, error } = await supabase
      .from("boss_question_cache")
      .select("skill_tag, questions")
      .eq("set_version", 1)
      .gte("fetched_at", since)
      .in("skill_tag", pool);
    if (error || !data) return NextResponse.json({ error: "Mock failed — retry." }, { status: 500 });
    const sets = (
      data as Array<{ skill_tag: string; questions: Array<{ level: number; prompt_latex: string; hint: string; tolerance: number; check: unknown }> }>
    )
      .filter((r) => Array.isArray(r.questions) && r.questions.length >= 5)
      .map((r) => ({ skill_tag: r.skill_tag, skill_name: skillName(r.skill_tag), questions: r.questions }));
    if (sets.length < THPT_CONFIG.skillsPerMock) {
      return NextResponse.json({ error: `Warming up: ${sets.length}/${THPT_CONFIG.skillsPerMock} skills cached.` }, { status: 503 });
    }
    const questions = buildMock(sets, day, THPT_CONFIG);
    const parsed = z.array(MockQuestion).safeParse(questions);
    if (!parsed.success) return NextResponse.json({ error: "Mock failed — retry." }, { status: 500 });
    return NextResponse.json({
      date: day,
      total: parsed.data.length,
      skills: [...new Set(parsed.data.map((q) => q.skill_tag))],
      questions: parsed.data,
    });
  } catch {
    return NextResponse.json({ error: "Mock failed — retry." }, { status: 500 });
  }
}

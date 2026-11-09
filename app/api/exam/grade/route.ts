import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ExamQuestion, EXAM_SET_VERSION, gradeSelection } from "@/lib/agents/exam";

// Stateless MC grading: the client sends the picked option index; the server
// re-reads the answer key from cache. Keys never reach the browser.
// `as_of` pins the paper: if prime refreshed mid-exam, answer 409 (reload).
const Body = z.object({
  section: z.string().min(1),
  index: z.number().int().min(0),
  selected: z.number().int().min(0).max(3),
  as_of: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing section, index, selected, or as_of." }, { status: 400 });
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("boss_question_cache")
      .select("questions, fetched_at")
      .eq("set_version", EXAM_SET_VERSION)
      .eq("skill_tag", parsed.data.section)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Grade failed — retry." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Unknown section." }, { status: 404 });
    if ((data as { fetched_at: string }).fetched_at !== parsed.data.as_of) {
      return NextResponse.json({ error: "Paper refreshed — reload." }, { status: 409 });
    }
    const qs = z.array(ExamQuestion).safeParse((data as { questions: unknown }).questions);
    if (!qs.success) return NextResponse.json({ error: "Grade failed — retry." }, { status: 500 });
    const q = qs.data[parsed.data.index];
    if (!q) return NextResponse.json({ error: "Question out of range." }, { status: 422 });
    return NextResponse.json({ correct: gradeSelection(q, parsed.data.selected) });
  } catch {
    return NextResponse.json({ error: "Grade failed — retry." }, { status: 500 });
  }
}

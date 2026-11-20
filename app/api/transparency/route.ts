import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Transparency report: real question-bank stats, computed live from cache.
// Boss sets (v1): machine-verified numeric. Exam sets (v2): verified math +
// cross-checked drafts. Nothing here is hardcoded except the method text.
const V1_FRESH_MS = 12 * 3600 * 1000;
const V2_FRESH_MS = 48 * 3600 * 1000;

const ExamQ = z.object({ tier: z.enum(["verified", "draft"]) });

export async function GET() {
  try {
    const supabase = await createClient();
    const [v1, v2] = await Promise.all([
      supabase.from("boss_question_cache").select("skill_tag, fetched_at").eq("set_version", 1).limit(5000),
      supabase.from("boss_question_cache").select("skill_tag, questions, fetched_at").eq("set_version", 2).limit(5000),
    ]);
    if (v1.error || v2.error || !v1.data || !v2.data) {
      return NextResponse.json({ error: "Tải báo cáo thất bại — thử lại." }, { status: 500 });
    }
    const now = Date.now();
    const v1rows = v1.data as Array<{ skill_tag: string; fetched_at: string }>;
    const v2rows = v2.data as Array<{ skill_tag: string; questions: unknown; fetched_at: string }>;
    let verifiedQ = 0;
    let draftQ = 0;
    for (const r of v2rows) {
      const qs = z.array(ExamQ).safeParse(r.questions);
      if (!qs.success) continue;
      for (const q of qs.data) {
        if (q.tier === "verified") verifiedQ += 1;
        else draftQ += 1;
      }
    }
    const newest = [...v1rows, ...v2rows]
      .map((r) => new Date(r.fetched_at).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0] ?? null;
    return NextResponse.json({
      windows: { bossH: V1_FRESH_MS / 3600000, examH: V2_FRESH_MS / 3600000 },
      bossSets: {
        total: v1rows.length,
        fresh12h: v1rows.filter((r) => now - new Date(r.fetched_at).getTime() <= V1_FRESH_MS).length,
      },
      examSections: {
        total: v2rows.length,
        fresh48h: v2rows.filter((r) => now - new Date(r.fetched_at).getTime() <= V2_FRESH_MS).length,
        verifiedQ,
        draftQ,
      },
      newestFetch: newest ? new Date(newest).toISOString() : null,
      method: [
        "Toán: câu số do máy rèn, được máy tính kiểm tra lại trước khi vào ngân hàng đề.",
        "Toán trắc nghiệm: 3 đáp án nhiễu, mỗi đáp án đều được chứng minh sai và khác nhau bằng phép tính.",
        "Môn khác: kiểm tra khung đề, chấm chéo độc lập, soát quy tắc — 3 lớp.",
        "Câu hỏng được thử lại 3 lần, nếu vẫn hỏng thì đề cũ tiếp tục chạy. Đề mới nạp mỗi 2 ngày.",
      ],
    });
  } catch {
    return NextResponse.json({ error: "Tải báo cáo thất bại — thử lại." }, { status: 500 });
  }
}

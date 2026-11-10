import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import {
  assembleReview,
  CacheRow,
  examConfig,
  ExamQuestion,
  EXAM_SET_VERSION,
  reviewAllowed,
} from "@/lib/agents/exam";

// Answer-key review: GET /api/exam/review?exam=vact&day=... (&p3=... for HSA).
// Gated on the exam_attempts first-fetch stamp: keys unlock once the paper
// clock (VACT 150', HSA 195') expires. Pre-0010 (table missing) the gate is
// skipped and the route serves as before.
const Row = z.object({ skill_tag: z.string(), questions: z.array(ExamQuestion), fetched_at: z.string() });

// Missing-table detector (mirrors isMissingRpc in lib/game/duel-settle.ts):
// PostgREST surfaces an absent table as 42P01 or PGRST205, or a "could not
// find / does not exist" message.
function isMissingTable(err: { code?: string; message?: string }): boolean {
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  return /could not find|does not exist/i.test(err.message ?? "");
}

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
    const playerId = await getPlayerId();
    if (!playerId) {
      return NextResponse.json(
        { error: "No attempt found — start the paper first.", retryAfterSec: config.totalMinutes * 60 },
        { status: 403 },
      );
    }
    const supabase = await createClient();
    const att = await supabase
      .from("exam_attempts")
      .select("started_at")
      .eq("player_id", playerId)
      .eq("exam", config.id)
      .eq("day", day)
      .maybeSingle();
    if (att.error) {
      // Missing table pre-migration: fall back to the open behavior.
      if (!isMissingTable(att.error as { code?: string; message?: string })) {
        return NextResponse.json({ error: "Review failed — retry." }, { status: 500 });
      }
    } else if (!att.data) {
      return NextResponse.json(
        { error: "No attempt found — start the paper first.", retryAfterSec: config.totalMinutes * 60 },
        { status: 403 },
      );
    } else {
      const startedAt = (att.data as { started_at: string }).started_at;
      const nowMs = Date.now();
      if (!reviewAllowed(startedAt, config.totalMinutes, nowMs)) {
        const raw = Math.ceil((new Date(startedAt).getTime() + config.totalMinutes * 60_000 - nowMs) / 1000);
        const retryAfterSec = Number.isFinite(raw) ? Math.max(1, raw) : config.totalMinutes * 60;
        return NextResponse.json(
          { error: "The paper is still running — the key unlocks when your clock expires.", retryAfterSec },
          { status: 403 },
        );
      }
    }
    const ids = config.sections.map((s) => s.id);
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

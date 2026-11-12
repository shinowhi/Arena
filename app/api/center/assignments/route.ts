import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { isTeacher } from "@/lib/center/center";
import { isValidSkill } from "@/lib/graph/skills";

// Teacher-only assignment composer (migration 0018). Only the class teacher
// may insert rows for that class (the assignments table has an open INSERT
// policy, so this route is the enforcement point — same shape as other
// teacher-scoped writes). skill_tag must be a real skill so student Practice
// links (/drill?skill=) always resolve. due_at is optional ISO.
const Body = z.object({
  class_id: z.string().uuid(),
  skill_tag: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  due_at: z.string().nullable().optional(),
});

type AssignmentRow = { id: string; class_id: string; skill_tag: string; title: string; due_at: string | null };

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send a class_id, skill_tag, and title." },
      { status: 400 },
    );
  }
  // 20/min per player-or-IP. Read-only identity: the 429 path mints nothing.
  const gateId = await getPlayerId().catch(() => null);
  const rl = checkRate(`center-assignments:${gateId ?? getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const { class_id, skill_tag, title, due_at } = parsed.data;
  if (!isValidSkill(skill_tag)) {
    return NextResponse.json({ error: "Unknown skill — pick one from the list." }, { status: 400 });
  }
  let dueIso: string | null = null;
  if (due_at !== undefined && due_at !== null && due_at !== "") {
    const ms = Date.parse(due_at);
    if (!Number.isFinite(ms)) {
      return NextResponse.json({ error: "due_at must be an ISO date or null." }, { status: 400 });
    }
    dueIso = new Date(ms).toISOString();
  }
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    if (!(await isTeacher(supabase, playerId, class_id))) {
      return NextResponse.json(
        { error: "Only the class teacher can post assignments." },
        { status: 403 },
      );
    }
    const ins = await supabase
      .from("assignments")
      .insert({ class_id, skill_tag, title, due_at: dueIso })
      .select("id, class_id, skill_tag, title, due_at")
      .single();
    if (ins.error || !ins.data) {
      return NextResponse.json(
        { error: "Assignments are not set up yet — run migration 0018." },
        { status: 503 },
      );
    }
    const row = ins.data as AssignmentRow;
    return NextResponse.json({
      id: row.id,
      class_id: row.class_id,
      skill_tag: row.skill_tag,
      title: row.title,
      due_at: row.due_at,
    });
  } catch {
    return NextResponse.json({ error: "Could not post assignment." }, { status: 500 });
  }
}

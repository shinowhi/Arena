// POST /api/social/report — report a player (stored for the site owner to review).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { REPORT_DETAILS_MAX, REPORT_REASON_MAX, isUuidLike } from "@/lib/social/rules";
import { needSocialMigration } from "@/lib/social/server";

const Body = z.object({
  reported_id: z.string().min(1),
  reason: z.string().trim().min(1).max(REPORT_REASON_MAX),
  details: z.string().trim().max(REPORT_DETAILS_MAX).optional().default(""),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isUuidLike(parsed.data.reported_id)) {
    return NextResponse.json({ error: "Pick a player and a reason." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    if (parsed.data.reported_id === me) {
      return NextResponse.json({ error: "You cannot report yourself." }, { status: 400 });
    }
    const db = await createClient();
    const { error } = await db.from("reports").insert({
      reporter_id: me,
      reported_id: parsed.data.reported_id,
      reason: parsed.data.reason,
      details: parsed.data.details ?? "",
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return needSocialMigration();
  }
}

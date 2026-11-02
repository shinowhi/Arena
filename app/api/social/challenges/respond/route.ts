// POST /api/social/challenges/respond — accept or decline a boss duel.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { needSocialMigration } from "@/lib/social/server";

const Body = z.object({
  challenge_id: z.string().min(1),
  action: z.enum(["accept", "decline"]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing challenge." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const { data, error } = await db
      .from("challenges")
      .select("id, to_id, boss_id, status")
      .eq("id", parsed.data.challenge_id)
      .single();
    const row = data as { id: string; to_id: string; boss_id: string; status: string } | null;
    if (error || !row || row.to_id !== me || row.status !== "PENDING") {
      return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    }
    const { error: upErr } = await db
      .from("challenges")
      .update({ status: parsed.data.action === "accept" ? "ACCEPTED" : "DECLINED" })
      .eq("id", row.id);
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true, link: `/boss/${row.boss_id}` });
  } catch {
    return needSocialMigration();
  }
}

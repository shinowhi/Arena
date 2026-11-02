// POST /api/social/friends/respond — accept or decline an incoming request.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { isBlockedEither, needSocialMigration } from "@/lib/social/server";

const Body = z.object({
  request_id: z.string().min(1),
  action: z.enum(["accept", "decline"]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing request." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const { data, error } = await db
      .from("friend_requests")
      .select("id, from_id, to_id, status")
      .eq("id", parsed.data.request_id)
      .single();
    const row = data as { id: string; from_id: string; to_id: string; status: string } | null;
    if (error || !row || row.to_id !== me || row.status !== "PENDING") {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    if (parsed.data.action === "accept" && (await isBlockedEither(db, me, row.from_id))) {
      return NextResponse.json({ error: "Unblock this player before accepting." }, { status: 403 });
    }
    const { error: upErr } = await db
      .from("friend_requests")
      .update({ status: parsed.data.action === "accept" ? "ACCEPTED" : "DECLINED" })
      .eq("id", row.id);
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true });
  } catch {
    return needSocialMigration();
  }
}

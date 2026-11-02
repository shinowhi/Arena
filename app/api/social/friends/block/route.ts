// POST /api/social/friends/block — block or unblock a player.
// Blocking ends any friendship/requests and bars ALL contact both directions.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { isUuidLike } from "@/lib/social/rules";
import { needSocialMigration } from "@/lib/social/server";

const Body = z.object({
  player_id: z.string().min(1),
  action: z.enum(["block", "unblock"]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isUuidLike(parsed.data.player_id)) {
    return NextResponse.json({ error: "Missing player." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const peer = parsed.data.player_id;
    if (peer === me) {
      return NextResponse.json({ error: "You cannot block yourself." }, { status: 400 });
    }
    const db = await createClient();
    if (parsed.data.action === "unblock") {
      await db.from("friend_blocks").delete().eq("blocker_id", me).eq("blocked_id", peer);
      return NextResponse.json({ ok: true });
    }
    const { error } = await db
      .from("friend_blocks")
      .upsert({ blocker_id: me, blocked_id: peer }, { onConflict: "blocker_id,blocked_id" });
    if (error) throw error;
    await db
      .from("friend_requests")
      .delete()
      .or(`and(from_id.eq.${me},to_id.eq.${peer}),and(from_id.eq.${peer},to_id.eq.${me})`);
    return NextResponse.json({ ok: true });
  } catch {
    return needSocialMigration();
  }
}

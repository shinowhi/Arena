// /api/social/gifts — send XP / an item label to a friend.
// GET: my sent + received history (newest first).
// POST { to, xp_amount, item? }: atomic via the send_gift() RPC — never negative.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { GIFT_ITEM_MAX, GIFT_MAX_XP, isUuidLike, playerLabel, validateGift } from "@/lib/social/rules";
import { areFriends, isBlockedEither, needSocialMigration } from "@/lib/social/server";

const Send = z.object({
  to: z.string().min(1),
  xp_amount: z.number().int().min(0).max(GIFT_MAX_XP),
  item: z.string().trim().max(GIFT_ITEM_MAX).optional().default(""),
});

interface GiftRow {
  id: string;
  from_id: string;
  to_id: string;
  xp_amount: number;
  item: string | null;
  created_at: string;
}

export async function GET() {
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const { data, error } = await db
      .from("gifts")
      .select("id, from_id, to_id, xp_amount, item, created_at")
      .or(`from_id.eq.${me},to_id.eq.${me}`)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    const rows = (data ?? []) as GiftRow[];
    const peerIds = [...new Set(rows.map((r) => (r.from_id === me ? r.to_id : r.from_id)))];
    const { data: players } = await db
      .from("players")
      .select("id, display_name")
      .in("id", peerIds.length ? peerIds : ["00000000-0000-0000-0000-000000000000"]);
    const names = new Map(
      ((players ?? []) as { id: string; display_name?: unknown }[]).map((p) => [p.id, p.display_name]),
    );
    const shape = (r: GiftRow) => {
      const peer = r.from_id === me ? r.to_id : r.from_id;
      return {
        id: r.id,
        sent: r.from_id === me,
        peer: playerLabel(peer, names.get(peer)),
        xp_amount: r.xp_amount,
        item: r.item,
        created_at: r.created_at,
      };
    };
    return NextResponse.json({
      sent: rows.filter((r) => r.from_id === me).map(shape),
      received: rows.filter((r) => r.to_id === me).map(shape),
    });
  } catch {
    return needSocialMigration();
  }
}

export async function POST(req: Request) {
  const parsed = Send.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid gift." }, { status: 400 });
  }
  if (!isUuidLike(parsed.data.to)) {
    return NextResponse.json({ error: "Missing friend." }, { status: 400 });
  }
  const giftErr = validateGift(parsed.data.xp_amount, parsed.data.item ?? "");
  if (giftErr) {
    return NextResponse.json({ error: giftErr }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const peer = parsed.data.to;
    if (peer === me) {
      return NextResponse.json({ error: "You cannot gift yourself." }, { status: 400 });
    }
    const db = await createClient();
    if (!(await areFriends(db, me, peer)) || (await isBlockedEither(db, me, peer))) {
      return NextResponse.json({ error: "You can only gift friends." }, { status: 403 });
    }
    const { error } = await db.rpc("send_gift", {
      p_from: me,
      p_to: peer,
      p_xp: parsed.data.xp_amount,
      p_item: parsed.data.item ?? "",
    });
    if (error) {
      if (error.message.includes("insufficient xp")) {
        return NextResponse.json({ error: "Not enough XP — solve bosses to earn more." }, { status: 400 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return needSocialMigration();
  }
}

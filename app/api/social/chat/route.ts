// /api/social/chat — friends-only 1-1 chat (enforced SERVER-side).
// GET ?with=<id>&since=<iso>: thread with a friend (oldest first, max 100).
// POST { to, body }: send (500-char cap + 10/min rate limit).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { MESSAGE_MAX_LEN, canMessage, isUuidLike, playerLabel } from "@/lib/social/rules";
import { areFriends, isBlockedEither, isRateLimited, needSocialMigration } from "@/lib/social/server";

const Send = z.object({
  to: z.string().min(1),
  body: z.string().trim().min(1).max(MESSAGE_MAX_LEN),
});

interface MsgRow {
  id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const peer = url.searchParams.get("with") ?? "";
  const since = url.searchParams.get("since") ?? "";
  if (!isUuidLike(peer)) {
    return NextResponse.json({ error: "Missing friend." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const friends = await areFriends(db, me, peer);
    const blocked = await isBlockedEither(db, me, peer);
    if (!canMessage({ friends, blockedEitherWay: blocked })) {
      return NextResponse.json({ error: "Only friends can message each other." }, { status: 403 });
    }
    let q = db
      .from("direct_messages")
      .select("id, from_id, to_id, body, created_at")
      .or(`and(from_id.eq.${me},to_id.eq.${peer}),and(from_id.eq.${peer},to_id.eq.${me})`)
      .order("created_at", { ascending: true })
      .limit(100);
    if (since) q = q.gt("created_at", since);
    const { data, error } = await q;
    if (error) throw error;
    const { data: peerRow } = await db.from("players").select("display_name").eq("id", peer).single();
    const label = playerLabel(peer, (peerRow as { display_name?: unknown } | null)?.display_name);
    return NextResponse.json({
      peer: { id: peer, label },
      messages: ((data ?? []) as MsgRow[]).map((m) => ({
        id: m.id,
        mine: m.from_id === me,
        body: m.body,
        created_at: m.created_at,
      })),
    });
  } catch {
    return needSocialMigration();
  }
}

export async function POST(req: Request) {
  const parsed = Send.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Message must be 1-${MESSAGE_MAX_LEN} characters.` },
      { status: 400 },
    );
  }
  if (!isUuidLike(parsed.data.to)) {
    return NextResponse.json({ error: "Missing recipient." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const peer = parsed.data.to;
    if (peer === me) {
      return NextResponse.json({ error: "You cannot message yourself." }, { status: 400 });
    }
    const db = await createClient();
    const friends = await areFriends(db, me, peer);
    const blocked = await isBlockedEither(db, me, peer);
    if (!canMessage({ friends, blockedEitherWay: blocked })) {
      return NextResponse.json({ error: "Only friends can message each other." }, { status: 403 });
    }
    if (await isRateLimited(db, "direct_messages", me)) {
      return NextResponse.json({ error: "Too many messages — slow down for a minute." }, { status: 429 });
    }
    const { data, error } = await db
      .from("direct_messages")
      .insert({ from_id: me, to_id: peer, body: parsed.data.body })
      .select("id, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch {
    return needSocialMigration();
  }
}

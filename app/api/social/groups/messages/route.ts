// /api/social/groups/messages — room chat (members only, SERVER-enforced).
// GET ?group_id=&since=: messages oldest-first, max 100.
// POST { group_id, body }: send (500-char cap + 10/min rate limit).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { MESSAGE_MAX_LEN, isUuidLike, playerLabel } from "@/lib/social/rules";
import { isGroupMember, isRateLimited, needSocialMigration } from "@/lib/social/server";

const Send = z.object({
  group_id: z.string().min(1),
  body: z.string().trim().min(1).max(MESSAGE_MAX_LEN),
});

interface MsgRow {
  id: string;
  from_id: string;
  body: string;
  created_at: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const groupId = url.searchParams.get("group_id") ?? "";
  const since = url.searchParams.get("since") ?? "";
  if (!isUuidLike(groupId)) {
    return NextResponse.json({ error: "Missing room." }, { status: 400 });
  }
  try {
    // SECURITY PHASE-1: thread reads never mint a player.
    const me = await getPlayerId();
    if (!me) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const db = await createClient();
    if (!(await isGroupMember(db, groupId, me))) {
      return NextResponse.json({ error: "You are not in this room." }, { status: 403 });
    }
    let q = db
      .from("group_messages")
      .select("id, from_id, body, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (since) q = q.gt("created_at", since);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as MsgRow[];
    const { data: players } = await db
      .from("players")
      .select("id, display_name")
      .in("id", [...new Set(rows.map((m) => m.from_id))]);
    const names = new Map(
      ((players ?? []) as { id: string; display_name?: unknown }[]).map((p) => [p.id, p.display_name]),
    );
    return NextResponse.json({
      messages: rows.map((m) => ({
        id: m.id,
        mine: m.from_id === me,
        sender: playerLabel(m.from_id, names.get(m.from_id)),
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
  if (!isUuidLike(parsed.data.group_id)) {
    return NextResponse.json({ error: "Missing room." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    if (!(await isGroupMember(db, parsed.data.group_id, me))) {
      return NextResponse.json({ error: "You are not in this room." }, { status: 403 });
    }
    if (await isRateLimited(db, "group_messages", me)) {
      return NextResponse.json({ error: "Too many messages — slow down for a minute." }, { status: 429 });
    }
    const { data, error } = await db
      .from("group_messages")
      .insert({ group_id: parsed.data.group_id, from_id: me, body: parsed.data.body })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: (data as { id: string }).id });
  } catch {
    return needSocialMigration();
  }
}

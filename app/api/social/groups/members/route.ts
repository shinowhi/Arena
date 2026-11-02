// /api/social/groups/members — member list + invite a friend.
// GET ?group_id=: members (must belong).
// POST { group_id, friend_id }: invite (must belong; invitee must be MY friend).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { isUuidLike, playerLabel } from "@/lib/social/rules";
import { areFriends, isBlockedEither, isGroupMember, needSocialMigration } from "@/lib/social/server";

const Invite = z.object({ group_id: z.string().min(1), friend_id: z.string().min(1) });

export async function GET(req: Request) {
  const groupId = new URL(req.url).searchParams.get("group_id") ?? "";
  if (!isUuidLike(groupId)) {
    return NextResponse.json({ error: "Missing room." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    if (!(await isGroupMember(db, groupId, me))) {
      return NextResponse.json({ error: "You are not in this room." }, { status: 403 });
    }
    const { data, error } = await db
      .from("group_members")
      .select("player_id, joined_at")
      .eq("group_id", groupId)
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []) as { player_id: string; joined_at: string }[];
    const { data: players } = await db
      .from("players")
      .select("id, display_name")
      .in("id", rows.map((r) => r.player_id));
    const names = new Map(
      ((players ?? []) as { id: string; display_name?: unknown }[]).map((p) => [p.id, p.display_name]),
    );
    return NextResponse.json({
      members: rows.map((r) => ({
        id: r.player_id,
        label: playerLabel(r.player_id, names.get(r.player_id)),
        you: r.player_id === me,
        joined_at: r.joined_at,
      })),
    });
  } catch {
    return needSocialMigration();
  }
}

export async function POST(req: Request) {
  const parsed = Invite.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isUuidLike(parsed.data.group_id) || !isUuidLike(parsed.data.friend_id)) {
    return NextResponse.json({ error: "Missing room or friend." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    if (!(await isGroupMember(db, parsed.data.group_id, me))) {
      return NextResponse.json({ error: "You are not in this room." }, { status: 403 });
    }
    const peer = parsed.data.friend_id;
    if (!(await areFriends(db, me, peer)) || (await isBlockedEither(db, me, peer))) {
      return NextResponse.json({ error: "You can only invite friends." }, { status: 403 });
    }
    const { error } = await db
      .from("group_members")
      .upsert({ group_id: parsed.data.group_id, player_id: peer }, { onConflict: "group_id,player_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return needSocialMigration();
  }
}

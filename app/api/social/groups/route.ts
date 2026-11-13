// /api/social/groups — my rooms + create.
// GET: groups I belong to (with member counts).
// POST { name }: create a room (I become owner + first member).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { GROUP_NAME_MAX } from "@/lib/social/rules";
import { needSocialMigration } from "@/lib/social/server";

const Create = z.object({ name: z.string().trim().min(1).max(GROUP_NAME_MAX) });

export async function GET() {
  try {
    // SECURITY PHASE-1: list reads never mint a player — no identity means
    // no rooms (a fresh player belongs to none either).
    const me = await getPlayerId();
    if (!me) return NextResponse.json({ groups: [] });
    const db = await createClient();
    const { data: mine, error } = await db
      .from("group_members")
      .select("group_id")
      .eq("player_id", me)
      .limit(100);
    if (error) throw error;
    const ids = ((mine ?? []) as { group_id: string }[]).map((m) => m.group_id);
    if (ids.length === 0) return NextResponse.json({ groups: [] });
    const { data: groups, error: gErr } = await db
      .from("groups")
      .select("id, name, owner_id, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (gErr) throw gErr;
    const { data: counts } = await db.from("group_members").select("group_id").in("group_id", ids);
    const n = new Map<string, number>();
    for (const c of (counts ?? []) as { group_id: string }[]) {
      n.set(c.group_id, (n.get(c.group_id) ?? 0) + 1);
    }
    return NextResponse.json({
      groups: ((groups ?? []) as { id: string; name: string; owner_id: string; created_at: string }[]).map(
        (g) => ({ ...g, mine: g.owner_id === me, members: n.get(g.id) ?? 0 }),
      ),
    });
  } catch {
    return needSocialMigration();
  }
}

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Room name must be 1-${GROUP_NAME_MAX} characters.` }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const { data, error } = await db
      .from("groups")
      .insert({ name: parsed.data.name, owner_id: me })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    const id = (data as { id: string }).id;
    const { error: mErr } = await db.from("group_members").insert({ group_id: id, player_id: me });
    if (mErr) throw mErr;
    return NextResponse.json({ id });
  } catch {
    return needSocialMigration();
  }
}

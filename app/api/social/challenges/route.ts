// /api/social/challenges — boss-duel invites between friends.
// GET: incoming + outgoing (each links a real /boss/[id]).
// POST { to, boss_id }: challenge a friend (friends-only, blocks enforced).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { isUuidLike, playerLabel } from "@/lib/social/rules";
import { areFriends, isBlockedEither, needSocialMigration } from "@/lib/social/server";

const Invite = z.object({ to: z.string().min(1), boss_id: z.string().min(1) });

interface DuelRow {
  id: string;
  from_id: string;
  to_id: string;
  boss_id: string;
  status: string;
  created_at: string;
}

export async function GET() {
  try {
    // SECURITY PHASE-1: list reads never mint a player — no identity means
    // no challenges (a fresh player has none either).
    const me = await getPlayerId();
    if (!me) return NextResponse.json({ incoming: [], outgoing: [] });
    const db = await createClient();
    const { data, error } = await db
      .from("challenges")
      .select("id, from_id, to_id, boss_id, status, created_at")
      .or(`from_id.eq.${me},to_id.eq.${me}`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []) as DuelRow[];
    const peerIds = [...new Set(rows.map((r) => (r.from_id === me ? r.to_id : r.from_id)))];
    const bossIds = [...new Set(rows.map((r) => r.boss_id))];
    const { data: players } = await db.from("players").select("id, display_name").in("id", peerIds.length ? peerIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: bosses } = await db.from("bosses").select("id, skill_tag, status").in("id", bossIds.length ? bossIds : ["00000000-0000-0000-0000-000000000000"]);
    const names = new Map(
      ((players ?? []) as { id: string; display_name?: unknown }[]).map((p) => [p.id, p.display_name]),
    );
    const bossInfo = new Map(
      ((bosses ?? []) as { id: string; skill_tag: string; status: string }[]).map((b) => [b.id, b]),
    );
    const shape = (r: DuelRow) => {
      const peer = r.from_id === me ? r.to_id : r.from_id;
      const b = bossInfo.get(r.boss_id);
      return {
        id: r.id,
        peer_id: peer,
        peer: playerLabel(peer, names.get(peer)),
        boss_id: r.boss_id,
        skill: b?.skill_tag ?? "boss",
        boss_status: b?.status ?? "ALIVE",
        link: `/boss/${r.boss_id}`,
        status: r.status,
        created_at: r.created_at,
      };
    };
    return NextResponse.json({
      incoming: rows.filter((r) => r.to_id === me).map(shape),
      outgoing: rows.filter((r) => r.from_id === me).map(shape),
    });
  } catch {
    return needSocialMigration();
  }
}

export async function POST(req: Request) {
  const parsed = Invite.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isUuidLike(parsed.data.to) || !isUuidLike(parsed.data.boss_id)) {
    return NextResponse.json({ error: "Missing friend or boss." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const peer = parsed.data.to;
    if (peer === me) {
      return NextResponse.json({ error: "You cannot duel yourself." }, { status: 400 });
    }
    const db = await createClient();
    if (!(await areFriends(db, me, peer)) || (await isBlockedEither(db, me, peer))) {
      return NextResponse.json({ error: "You can only duel friends." }, { status: 403 });
    }
    const { data: boss, error: bossErr } = await db
      .from("bosses")
      .select("id")
      .eq("id", parsed.data.boss_id)
      .single();
    if (bossErr || !boss) {
      return NextResponse.json({ error: "Boss not found — summon one first." }, { status: 404 });
    }
    const { data, error } = await db
      .from("challenges")
      .insert({ from_id: me, to_id: peer, boss_id: parsed.data.boss_id })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ id: (data as { id: string }).id, link: `/boss/${parsed.data.boss_id}` });
  } catch {
    return needSocialMigration();
  }
}

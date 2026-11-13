// /api/social/friends — list friends + pending requests; send by code; remove.
// GET: { friends, incoming, outgoing } with labels.
// POST { code }: send a request (strangers can ONLY do this, never message).
// DELETE { friend_id }: remove a friend (both directions).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { isUuidLike, normalizeCode, playerLabel } from "@/lib/social/rules";
import { areFriends, isBlockedEither, needSocialMigration } from "@/lib/social/server";

const Send = z.object({ code: z.string().trim().min(1).max(16) });
const Remove = z.object({ friend_id: z.string().min(1) });

interface ReqRow {
  id: string;
  from_id: string;
  to_id: string;
  status: string;
  created_at: string;
}

async function labelsFor(ids: string[]) {
  const db = await createClient();
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await db.from("players").select("id, display_name").in("id", [...new Set(ids)]);
  for (const p of (data ?? []) as { id: string; display_name?: unknown }[]) {
    map.set(p.id, playerLabel(p.id, p.display_name));
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, playerLabel(id, null));
  }
  return map;
}

export async function GET() {
  try {
    // SECURITY PHASE-1: list reads never mint a player — no identity means
    // no friends (a fresh player has none either).
    const me = await getPlayerId();
    if (!me) return NextResponse.json({ friends: [], incoming: [], outgoing: [] });
    const db = await createClient();
    const { data, error } = await db
      .from("friend_requests")
      .select("id, from_id, to_id, status, created_at")
      .or(`from_id.eq.${me},to_id.eq.${me}`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = (data ?? []) as ReqRow[];
    const ids: string[] = [];
    for (const r of rows) ids.push(r.from_id === me ? r.to_id : r.from_id);
    const labels = await labelsFor(ids);
    const shape = (r: ReqRow) => {
      const peer = r.from_id === me ? r.to_id : r.from_id;
      return { id: r.id, peer_id: peer, label: labels.get(peer), created_at: r.created_at };
    };
    return NextResponse.json({
      friends: rows.filter((r) => r.status === "ACCEPTED").map(shape),
      incoming: rows.filter((r) => r.status === "PENDING" && r.to_id === me).map(shape),
      outgoing: rows.filter((r) => r.status === "PENDING" && r.from_id === me).map(shape),
    });
  } catch {
    return needSocialMigration();
  }
}

export async function POST(req: Request) {
  const parsed = Send.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a friend code." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const code = normalizeCode(parsed.data.code);
    const { data: codeRow, error: codeErr } = await db
      .from("player_codes")
      .select("player_id")
      .eq("code", code)
      .single();
    if (codeErr || !codeRow) {
      return NextResponse.json({ error: "Unknown friend code." }, { status: 404 });
    }
    const peer = (codeRow as { player_id: string }).player_id;
    if (peer === me) {
      return NextResponse.json({ error: "That is your own code — share it with a friend." }, { status: 400 });
    }
    if (await isBlockedEither(db, me, peer)) {
      return NextResponse.json({ error: "Cannot send a request to this player." }, { status: 403 });
    }
    if (await areFriends(db, me, peer)) {
      return NextResponse.json({ error: "You are already friends." }, { status: 400 });
    }
    // If they already requested me, accept theirs instead of duplicating.
    const { data: reverse } = await db
      .from("friend_requests")
      .select("id")
      .eq("from_id", peer)
      .eq("to_id", me)
      .eq("status", "PENDING")
      .single();
    if (reverse) {
      const { error } = await db
        .from("friend_requests")
        .update({ status: "ACCEPTED" })
        .eq("id", (reverse as { id: string }).id);
      if (error) throw error;
      return NextResponse.json({ accepted: true });
    }
    const { data: fwd } = await db
      .from("friend_requests")
      .select("id, status")
      .eq("from_id", me)
      .eq("to_id", peer)
      .single();
    const fwdRow = fwd as { id: string; status: string } | null;
    if (fwdRow?.status === "PENDING") {
      return NextResponse.json({ error: "Request already sent — waiting for them." }, { status: 400 });
    }
    if (fwdRow) {
      const { error } = await db
        .from("friend_requests")
        .update({ status: "PENDING" })
        .eq("id", fwdRow.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const { error } = await db.from("friend_requests").insert({ from_id: me, to_id: peer });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return needSocialMigration();
  }
}

export async function DELETE(req: Request) {
  const parsed = Remove.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isUuidLike(parsed.data.friend_id)) {
    return NextResponse.json({ error: "Missing friend." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const peer = parsed.data.friend_id;
    const { error } = await db
      .from("friend_requests")
      .delete()
      .or(`and(from_id.eq.${me},to_id.eq.${peer}),and(from_id.eq.${peer},to_id.eq.${me})`);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return needSocialMigration();
  }
}

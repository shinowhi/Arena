import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { isVip } from "@/lib/vip";
import { previewOf, sanitizeTitle, THREADS_LIMIT } from "@/lib/tutor/threads";

// VIP tutor memory: thread list + creation. GET is open (read-only identity,
// unknown visitors get [] WITHOUT minting a player); POST is VIP-ONLY (402
// like essay grading — memory is the VIP hook). Owner checks everywhere:
// threads are always filtered by the server-resolved player_id. Ids, titles,
// timestamps, and previews only.
export async function GET(req: Request) {
  const playerId = await getPlayerId().catch(() => null);
  const rl = checkRate(`tutor-threads:${playerId ?? getClientIp(req)}`, 30, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!playerId) return NextResponse.json({ threads: [] });
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tutor_threads")
      .select("id, title, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(THREADS_LIMIT);
    if (error || !Array.isArray(data)) return NextResponse.json({ threads: [] });
    const rows = data as Array<{ id: string; title: string; created_at: string }>;
    // Latest message per thread for previews (one query, newest first, so the
    // first row seen per thread wins).
    const latest = new Map<string, string>();
    if (rows.length > 0) {
      const m = await supabase
        .from("tutor_messages")
        .select("thread_id, content")
        .in(
          "thread_id",
          rows.map((r) => r.id),
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (!m.error && Array.isArray(m.data)) {
        for (const row of m.data as Array<{ thread_id: string; content: unknown }>) {
          if (!latest.has(row.thread_id) && typeof row.content === "string") {
            latest.set(row.thread_id, row.content);
          }
        }
      }
    }
    return NextResponse.json({
      threads: rows.map((r) => ({
        id: r.id,
        title: typeof r.title === "string" ? r.title : "Chat",
        created_at: r.created_at,
        preview: previewOf(latest.get(r.id) ?? null),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load threads." }, { status: 500 });
  }
}

const PostBody = z.object({ title: z.string().max(200).optional() });

export async function POST(req: Request) {
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid thread title." }, { status: 400 });
  const rl = checkRate(`tutor-threads-new:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  // VIP-only, gated BEFORE any write. Read-only identity: unknown visitors
  // are not VIP and mint no player.
  const playerId = await getPlayerId().catch(() => null);
  const vip = playerId ? await isVip(await createClient(), playerId) : false;
  if (!vip || !playerId) {
    return NextResponse.json(
      {
        error: "Thread memory is a VIP feature. Enter a VIP code to unlock it.",
        vip_url: "/vip",
      },
      { status: 402 },
    );
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tutor_threads")
      .insert({ player_id: playerId, title: sanitizeTitle(parsed.data.title) })
      .select("id, title, created_at")
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not create thread." }, { status: 500 });
    const t = data as { id: string; title: string; created_at: string };
    return NextResponse.json({ id: t.id, title: t.title, created_at: t.created_at, preview: "" });
  } catch {
    return NextResponse.json({ error: "Could not create thread." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { isValidSkill, skillName } from "@/lib/graph/skills";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const ipRl = checkRate(`pvp-rooms:ip:${getClientIp(req)}`, 30, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    // SECURITY PHASE-1: no identity → no rooms, without minting a player
    // (a freshly minted player owns no rooms either, so this is identical).
    const playerId = await getPlayerId();
    if (!playerId) return NextResponse.json({ rooms: [] });
    const rl = checkRate(`pvp-rooms:${playerId}`, 30, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("bosses")
      .select("id, skill_tag, status, despawn_at, spawn_at")
      .eq("owner_player_id", playerId)
      .like("skill_tag", "pvp:%")
      .eq("status", "ALIVE")
      .gt("despawn_at", now)
      .order("spawn_at", { ascending: false })
      .limit(10);
    if (error || !data) return NextResponse.json({ error: "Rooms failed — retry." }, { status: 500 });
    return NextResponse.json({
      rooms: (data as Array<{ id: string; skill_tag: string; despawn_at: string }>).map((r) => {
        const skill = r.skill_tag.slice(4);
        return { room_id: r.id, skill_tag: skill, skill_name: isValidSkill(skill) ? skillName(skill) : skill, despawn_at: r.despawn_at };
      }),
    });
  } catch {
    return NextResponse.json({ error: "Rooms failed — retry." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { skillName } from "@/lib/graph/skills";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { toPublicRaid, type RaidRow } from "@/lib/raid/raid";

// Public raid feed for the RaidBanner: alive raid bosses, soonest-expiring
// first. Stripped app-side to banner fields only — questions never leave the
// server. Fail-soft (empty list) when raids are not set up yet or the DB
// blips, so the banner hides instead of breaking the page.
export async function GET(req: Request) {
  const rl = checkRate(`raids:${getClientIp(req)}`, 30, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  try {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("bosses")
      .select("id, skill_tag, rarity, current_hp, max_hp, despawn_at")
      .eq("is_raid", true)
      .eq("status", "ALIVE")
      .gt("despawn_at", nowIso)
      .order("despawn_at", { ascending: true });
    if (error || !data) return NextResponse.json({ raids: [] });
    const nowMs = Date.now();
    return NextResponse.json({
      raids: (data as RaidRow[]).map((r) => toPublicRaid(r, skillName(r.skill_tag), nowMs)),
    });
  } catch {
    return NextResponse.json({ raids: [] });
  }
}

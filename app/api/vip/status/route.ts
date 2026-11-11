import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { countToday, FREE_SCAN_DAILY, FREE_TUTOR_DAILY, getVipUntil } from "@/lib/vip";

// VIP status + daily usage. Read-only: uses getPlayerId (never mints a
// player) and returns free-tier defaults for unknown visitors. Limits are
// null when VIP (unlimited).
export async function GET() {
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) {
    return NextResponse.json({
      vip: false,
      vip_until: null,
      scans_used_today: 0,
      scans_limit: FREE_SCAN_DAILY,
      tutor_used_today: 0,
      tutor_limit: FREE_TUTOR_DAILY,
    });
  }
  const supabase = await createClient();
  const vipUntil = await getVipUntil(supabase, playerId);
  const vip = !!vipUntil && Date.parse(vipUntil) > Date.now();
  const [scans, tutor] = await Promise.all([
    countToday(supabase, playerId, "scan_started"),
    countToday(supabase, playerId, "tutor_asked"),
  ]);
  return NextResponse.json({
    vip,
    vip_until: vipUntil,
    scans_used_today: scans,
    scans_limit: vip ? null : FREE_SCAN_DAILY,
    tutor_used_today: tutor,
    tutor_limit: vip ? null : FREE_TUTOR_DAILY,
  });
}

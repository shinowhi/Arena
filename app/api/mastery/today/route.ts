import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { computeMastery } from "@/lib/mastery/compute";
import { loadMasteryInput } from "@/lib/mastery/load";
import { dueSkillsForReview, pickToday } from "@/lib/mastery/today";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Today's practice list: SM-2 due skills first, then weak/shaky ones, else a
// fresh-drill fallback. Read-only identity: unknown visitors get the fallback
// WITHOUT minting a player row. Labels + hrefs only — never answers or keys.
export async function GET(req: Request) {
  const playerId = await getPlayerId().catch(() => null);
  const rl = checkRate(`mastery-today:${playerId ?? getClientIp(req)}`, 30, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!playerId) return NextResponse.json({ items: pickToday([], []) });
  try {
    const supabase = await createClient();
    const input = await loadMasteryInput(supabase, playerId);
    const mastery = computeMastery(input.attempts, input.scans, input.slain);
    return NextResponse.json({ items: pickToday(mastery, dueSkillsForReview(input.attempts)) });
  } catch {
    return NextResponse.json({ error: "Could not load today's practice." }, { status: 500 });
  }
}

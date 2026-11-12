import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { computeMastery } from "@/lib/mastery/compute";
import { loadMasteryInput } from "@/lib/mastery/load";
import { dueSkillsForReview, pickToday } from "@/lib/mastery/today";
import { pickNudges } from "@/lib/tutor/nudges";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Homework nudges: top-2 due/weak skills as {label, href, reason}. Rule-based,
// NO LLM — reuses the mastery today pipeline read-only (load -> compute ->
// pick -> narrow), same as app/api/mastery/today/route.ts. Read-only
// identity: unknown visitors get generic items WITHOUT minting a player row.
// Labels + hrefs only — never answers or keys.
export async function GET(req: Request) {
  const playerId = await getPlayerId().catch(() => null);
  const rl = checkRate(`tutor-nudge:${playerId ?? getClientIp(req)}`, 30, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!playerId) return NextResponse.json({ items: pickNudges(pickToday([], [])) });
  try {
    const supabase = await createClient();
    const input = await loadMasteryInput(supabase, playerId);
    const mastery = computeMastery(input.attempts, input.scans, input.slain);
    return NextResponse.json({ items: pickNudges(pickToday(mastery, dueSkillsForReview(input.attempts))) });
  } catch {
    return NextResponse.json({ error: "Could not load nudges." }, { status: 500 });
  }
}

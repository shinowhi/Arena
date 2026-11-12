import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { computeMastery } from "@/lib/mastery/compute";
import { loadMasteryInput } from "@/lib/mastery/load";
import { skillName } from "@/lib/graph/skills";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Per-skill mastery aggregates from YOUR attempts, scans, and slain bosses.
// Read-only identity: unknown visitors get an empty list WITHOUT minting a
// player row. Counts only — never answers or keys.
export async function GET(req: Request) {
  const playerId = await getPlayerId().catch(() => null);
  const rl = checkRate(`mastery:${playerId ?? getClientIp(req)}`, 30, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const updated_at = new Date().toISOString();
  if (!playerId) return NextResponse.json({ skills: [], updated_at });
  try {
    const supabase = await createClient();
    const input = await loadMasteryInput(supabase, playerId);
    const skills = computeMastery(input.attempts, input.scans, input.slain).map((m) => ({
      ...m,
      name: skillName(m.tag),
    }));
    return NextResponse.json({ skills, updated_at });
  } catch {
    return NextResponse.json({ error: "Could not load mastery." }, { status: 500 });
  }
}

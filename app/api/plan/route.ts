import { NextResponse } from "next/server";
import { buildPlan } from "@/lib/agents/planner";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // IP bucket first (before the minting DB write); player bucket after auth.
  const ipRl = checkRate(`plan:ip:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const playerId = await getOrCreatePlayerId();
    const rl = checkRate(`plan:${playerId}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("scans")
      .select("weak_skill, root_cause, confidence, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Could not load scan history.");
    const rows = (data ?? []) as Array<{
      weak_skill: string;
      root_cause: string;
      confidence: number;
      created_at: string;
    }>;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Scan your work first — the plan is built from your real gaps." }, { status: 404 });
    }
    const plan = await buildPlan(rows);
    return NextResponse.json(plan);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Plan failed." },
      { status: 422 },
    );
  }
}

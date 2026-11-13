// POST /api/market/claim — attempt a bounty. Atomic in claim_bounty():
// first correct solver wins, self-claim and double-claim are impossible.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

const Body = z.object({ post_id: z.string().uuid(), answer: z.number().finite() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A numeric answer is required." }, { status: 400 });
  // Brute-forceable answers: IP bucket first, player bucket after auth.
  const ipRl = checkRate(`market-claim:ip:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const me = await getOrCreatePlayerId();
    const rl = checkRate(`market-claim:${me}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const db = await createClient();
    const { data, error } = await db.rpc("claim_bounty", {
      p_post: parsed.data.post_id,
      p_solver: me,
      p_answer: parsed.data.answer,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { ok: boolean; reason: string; bounty: number };
    if (!row?.ok) {
      const friendly: Record<string, [string, number]> = {
        "wrong answer": ["Not quite — check your work and try again.", 400],
        "already claimed": ["Too slow — another hunter claimed this bounty.", 409],
        "own post": ["You cannot claim your own bounty.", 400],
        "not found": ["That bounty no longer exists.", 404],
        "unknown solver": ["Unknown hunter. Reload and try again.", 400],
      };
      const [errorMsg, status] = friendly[row?.reason] ?? ["Claim failed.", 400];
      return NextResponse.json({ error: errorMsg }, { status });
    }
    return NextResponse.json({ ok: true, bounty: row.bounty });
  } catch {
    return NextResponse.json(
      { error: "The market needs a database update (migration 0005).", needsMigration: true },
      { status: 503 },
    );
  }
}

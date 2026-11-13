import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

const Body = z.object({ inviter_id: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing inviter_id." }, { status: 400 });
  // Brute-forceable ids: IP bucket first, player bucket after auth.
  const ipRl = checkRate(`invite-claim:ip:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const inviteeId = await getOrCreatePlayerId();
    const rl = checkRate(`invite-claim:${inviteeId}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("claim_invite", {
      p_inviter: parsed.data.inviter_id,
      p_invitee: inviteeId,
    });
    if (error) throw new Error("Could not claim invite.");
    const row = (data as Array<{ awarded: boolean; invitee_xp: number }>)?.[0];
    return NextResponse.json({ awarded: row?.awarded ?? false, xp: row?.invitee_xp ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Claim failed." },
      { status: 500 },
    );
  }
}
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeCode } from "@/lib/vip";

// VIP code claim: {code} -> {vip_until}. Validation (trim/uppercase/<=32)
// lives in normalizeCode (lib/vip.ts); redemption is atomic in the
// claim_vip_code RPC (migration 0012). RPC raise tokens map to friendly
// English copy — no internals leak to the client.
const Body = z.object({ code: z.string() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a VIP code." }, { status: 400 });
  const code = normalizeCode(parsed.data.code);
  if (!code) {
    return NextResponse.json(
      { error: "Enter a valid VIP code (1–32 characters)." },
      { status: 400 },
    );
  }
  // IP bucket BEFORE identity: claim spam must not mint a player row per
  // attempt. The per-player bucket inside the try stays as a second layer.
  const ipRl = checkRate(`vip-claim:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const playerId = await getOrCreatePlayerId();
    const rl = checkRate(`vip-claim:${playerId}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("claim_vip_code", {
      p_player: playerId,
      p_code: code,
    });
    if (error) {
      const msg = error.message ?? "";
      if (/claim_vip_code|does not exist|schema cache|function .* not/i.test(msg)) {
        return NextResponse.json(
          { error: "VIP is not set up yet — run migration 0012." },
          { status: 503 },
        );
      }
      if (/expired/i.test(msg)) {
        return NextResponse.json({ error: "This code has expired." }, { status: 400 });
      }
      if (/exhausted/i.test(msg)) {
        return NextResponse.json(
          { error: "This code has already been fully redeemed." },
          { status: 400 },
        );
      }
      if (/duplicate|unique|already/i.test(msg)) {
        return NextResponse.json(
          { error: "You have already redeemed this code." },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "This code is not valid. Check it and try again." },
        { status: 400 },
      );
    }
    return NextResponse.json({ vip_until: data });
  } catch {
    return NextResponse.json({ error: "Claim failed — retry." }, { status: 500 });
  }
}

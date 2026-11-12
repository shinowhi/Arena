import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { getBalance } from "@/lib/billing/xu";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Daily Xu claim: POST -> {balance}. Calls the claim_daily_xu RPC through the
// ANON client — the RPC intentionally keeps its PUBLIC execute (migration
// 0016): public execute is SAFE here because the +100 amount is fixed
// server-side inside the RPC and the xu_daily_uidx partial unique index
// enforces once-per-player-per-UTC-day, so there is no parameter to abuse.
// Second claim of the day -> 409 {error: "already-claimed", balance}.
export async function POST(req: Request) {
  // IP bucket BEFORE identity: claim spam must not mint a player row per
  // attempt (same two-layer shape as the VIP claim route).
  const ipRl = checkRate(`billing-xu-claim:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const playerId = await getOrCreatePlayerId();
    const rl = checkRate(`billing-xu-claim:${playerId}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("claim_daily_xu", { p_player: playerId });
    if (error) {
      const msg = error.message ?? "";
      if (/claim_daily_xu|does not exist|schema cache|function .* not/i.test(msg)) {
        return NextResponse.json(
          { error: "Billing is not set up yet — run migration 0016." },
          { status: 503 },
        );
      }
      if (/xu_already_claimed/i.test(msg)) {
        const balance = await getBalance(supabase, playerId);
        return NextResponse.json({ error: "already-claimed", balance }, { status: 409 });
      }
      return NextResponse.json({ error: "Claim failed — retry." }, { status: 500 });
    }
    const balance = typeof data === "number" ? data : await getBalance(supabase, playerId);
    return NextResponse.json({ balance });
  } catch {
    return NextResponse.json({ error: "Claim failed — retry." }, { status: 500 });
  }
}

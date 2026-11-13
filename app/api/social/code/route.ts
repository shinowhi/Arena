// GET /api/social/code — my shareable friend code (+ invite link). Mints one on first use.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { newCode } from "@/lib/social/rules";
import { needSocialMigration } from "@/lib/social/server";

export async function GET(req: Request) {
  // Minting endpoint: IP bucket first so fresh-cookie loops cannot mint
  // unlimited players+codes.
  const rl = checkRate(`social-code:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const { data: existing, error: readErr } = await db
      .from("player_codes")
      .select("code")
      .eq("player_id", me)
      .single();
    if (readErr && readErr.code !== "PGRST116") throw readErr;
    const codeRow = existing as { code: string } | null;
    if (codeRow?.code) {
      return NextResponse.json({ code: codeRow.code, link: `/friends?code=${codeRow.code}` });
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = newCode();
      const { data, error } = await db
        .from("player_codes")
        .insert({ player_id: me, code })
        .select("code")
        .single();
      if (!error && data) {
        const fresh = (data as { code: string }).code;
        return NextResponse.json({ code: fresh, link: `/friends?code=${fresh}` });
      }
    }
    throw new Error("Could not mint a friend code.");
  } catch {
    return needSocialMigration();
  }
}

import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// GET /api/auth/me — session proof + link snapshot:
// {authed, email, player_id|null, role|null}. Null-safe: anything missing or
// failing degrades to the logged-out shape (never 500 on identity).
const LOGGED_OUT = { authed: false, email: null, player_id: null, role: null };

export async function GET(req: Request) {
  const ipRl = checkRate(`auth-me:${getClientIp(req)}`, 30, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const auth = await createAuthClient();
    const user = await getAuthUser(auth);
    if (!user) return NextResponse.json(LOGGED_OUT);
    const supabase = await createClient();
    const r = await supabase
      .from("auth_links")
      .select("player_id, role")
      .eq("auth_user_id", user.id)
      .limit(1);
    if (r.error || !Array.isArray(r.data) || r.data.length === 0) {
      return NextResponse.json({
        authed: true,
        email: user.email,
        player_id: null,
        role: null,
      });
    }
    const link = r.data[0] as { player_id: string; role: string };
    return NextResponse.json({
      authed: true,
      email: user.email,
      player_id: link.player_id,
      role: link.role,
    });
  } catch {
    return NextResponse.json(LOGGED_OUT);
  }
}

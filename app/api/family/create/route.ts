import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { generateLinkCode, parentHasFamilySub } from "@/lib/family/family";

// POST /api/family/create — parent: create (or re-fetch) the family.
// Gate: the caller must hold an ACTIVE family_2/family_4 subscription,
// otherwise 402. Idempotent per parent: a parent with an active family gets
// the existing {family_id, link_code} back (no orphan families).
// -> { family_id, link_code, plan_code } | { error }
export async function POST(req: Request) {
  // IP bucket BEFORE identity: create spam must not mint a player row per
  // attempt (same two-layer shape as the VIP claim route).
  const ipRl = checkRate(`family-create:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const parentId = await getOrCreatePlayerId();
    const rl = checkRate(`family-create:${parentId}`, 20, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const gate = await parentHasFamilySub(supabase, parentId);
    if (!gate.ok || !gate.planCode) {
      return NextResponse.json(
        { error: "Family needs an active Family plan — pick Family 2 or Family 4 first." },
        { status: 402 },
      );
    }
    // Idempotent: return the parent's active family when one exists.
    const existing = await supabase
      .from("families")
      .select("id, link_code, plan_code")
      .eq("parent_player_id", parentId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existing.error) {
      return NextResponse.json(
        { error: "Family is not set up yet — run migration 0017." },
        { status: 503 },
      );
    }
    if (Array.isArray(existing.data) && existing.data.length > 0) {
      const row = existing.data[0] as { id: string; link_code: string; plan_code: string };
      return NextResponse.json({
        family_id: row.id,
        link_code: row.link_code,
        plan_code: row.plan_code,
      });
    }
    // Insert the family; on a link_code collision (unique index) retry with
    // a fresh code a few times before giving up (same shape as order memos).
    let family: { id: string; link_code: string; plan_code: string } | null = null;
    for (let attempt = 0; attempt < 5 && !family; attempt += 1) {
      const r = await supabase
        .from("families")
        .insert({
          parent_player_id: parentId,
          plan_code: gate.planCode,
          link_code: generateLinkCode(),
        })
        .select("id, link_code, plan_code")
        .single();
      if (!r.error && r.data) {
        family = r.data as { id: string; link_code: string; plan_code: string };
      } else if (!/duplicate|unique|already/i.test(r.error?.message ?? "")) {
        return NextResponse.json(
          { error: "Family is not set up yet — run migration 0017." },
          { status: 503 },
        );
      } else {
        // Duplicate: either a link_code collision (retry below) or a racing
        // create won families_parent_active_uidx — re-fetch and return the
        // winner instead of orphaning a second family.
        const won = await supabase
          .from("families")
          .select("id, link_code, plan_code")
          .eq("parent_player_id", parentId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1);
        if (!won.error && Array.isArray(won.data) && won.data.length > 0) {
          const row = won.data[0] as { id: string; link_code: string; plan_code: string };
          return NextResponse.json({
            family_id: row.id,
            link_code: row.link_code,
            plan_code: row.plan_code,
          });
        }
      }
    }
    if (!family) {
      return NextResponse.json({ error: "Could not create family — retry." }, { status: 500 });
    }
    return NextResponse.json(
      { family_id: family.id, link_code: family.link_code, plan_code: family.plan_code },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Could not create family — retry." }, { status: 500 });
  }
}

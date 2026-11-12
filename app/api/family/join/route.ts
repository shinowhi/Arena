import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { canJoin, normalizeLinkCode, parentHasFamilySub, seatsFor } from "@/lib/family/family";

// POST /api/family/join {code} — kid device: join the parent's family.
// Guards (friendly English, no internals): code shape -> 400, unknown code ->
// 404, own family code -> 400, already in a family -> 409, seats full -> 409.
// -> { family_id, seats_used, seats_total } | { error }
const Body = z.object({ code: z.string() });

type FamilyRow = {
  id: string;
  parent_player_id: string;
  plan_code: string;
  status: string;
  link_code: string;
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the 8-letter family code." }, { status: 400 });
  }
  const code = normalizeLinkCode(parsed.data.code);
  if (!code) {
    return NextResponse.json(
      { error: "That code does not look right — 8 letters, check and retry." },
      { status: 400 },
    );
  }
  // IP bucket BEFORE identity: join spam must not mint a player row per
  // attempt (same two-layer shape as the VIP claim route).
  const ipRl = checkRate(`family-join:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const childId = await getOrCreatePlayerId();
    const rl = checkRate(`family-join:${childId}`, 20, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    // One family per kid: reject before touching the family row.
    const mine = await supabase
      .from("family_members")
      .select("family_id")
      .eq("child_player_id", childId)
      .limit(1);
    if (mine.error) {
      return NextResponse.json(
        { error: "Family is not set up yet — run migration 0017." },
        { status: 503 },
      );
    }
    if (Array.isArray(mine.data) && mine.data.length > 0) {
      return NextResponse.json(
        { error: "This device already joined a family." },
        { status: 409 },
      );
    }
    const fam = await supabase
      .from("families")
      .select("id, parent_player_id, plan_code, status, link_code")
      .eq("link_code", code)
      .limit(1);
    if (fam.error || !Array.isArray(fam.data) || fam.data.length === 0) {
      if (fam.error) {
        return NextResponse.json(
          { error: "Family is not set up yet — run migration 0017." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "No family uses that code — check and retry." },
        { status: 404 },
      );
    }
    const family = fam.data[0] as FamilyRow;
    if (family.status !== "active") {
      return NextResponse.json(
        { error: "This family plan is no longer active." },
        { status: 400 },
      );
    }
    if (family.parent_player_id === childId) {
      return NextResponse.json(
        { error: "That is your own family code — share it with the kid's device." },
        { status: 400 },
      );
    }
    // Seats follow the parent's LIVE plan, not the stored one: a downgraded
    // family (4 seats stored, family_2 live) admits no new kids past 2, and a
    // lapsed subscription admits none. Existing members are grandfathered.
    const live = await parentHasFamilySub(supabase, family.parent_player_id);
    if (!live.ok || !live.planCode) {
      return NextResponse.json(
        { error: "This family plan is no longer active — ask the parent to renew." },
        { status: 409 },
      );
    }
    const members = await supabase
      .from("family_members")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id);
    if (members.error) {
      return NextResponse.json(
        { error: "Family is not set up yet — run migration 0017." },
        { status: 503 },
      );
    }
    const used = members.count ?? 0;
    if (!canJoin(used, live.planCode)) {
      return NextResponse.json(
        { error: "This family is full — ask the parent to upgrade seats." },
        { status: 409 },
      );
    }
    const ins = await supabase.from("family_members").insert({
      family_id: family.id,
      child_player_id: childId,
    });
    if (ins.error) {
      if (/duplicate|unique|already/i.test(ins.error.message ?? "")) {
        return NextResponse.json(
          { error: "This device already joined a family." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not join family — retry." }, { status: 500 });
    }
    return NextResponse.json(
      { family_id: family.id, seats_used: used + 1, seats_total: seatsFor(live.planCode) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Could not join family — retry." }, { status: 500 });
  }
}

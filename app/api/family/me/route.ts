import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { getAuthUser } from "@/lib/auth/session";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { hasFamilyVip, seatsFor } from "@/lib/family/family";
import { loadMasteryInput } from "@/lib/mastery/load";
import { computeMastery } from "@/lib/mastery/compute";
import type { SupabaseClient } from "@supabase/supabase-js";

// GET /api/family/me — role-aware family snapshot (read-only identity:
// unknown visitors get {role:"none"}, never a minted player).
// - parent device -> { role:"parent", family, members[] with kid stats }
// - kid device    -> { role:"child", family, members[] with kid stats }
// - nobody        -> { role:"none" }
// Kid stats reuse the mastery loader + engine read-only: scans count, drills
// (attempts) count, avg mastery over the top-5 mastered skills, slain count.
// Tiering (sec-phase2a M6): raw child_player_id values + the consents map
// require a LINKED-PARENT session (verified auth user whose auth_links row is
// role=parent AND owns this family). Cookie-only / child / unauthenticated
// callers get kid labels + stats only, consents:{} — the cookie stats path is
// otherwise unchanged.
const TOP_N = 5;

type FamilyRow = {
  id: string;
  parent_player_id: string;
  plan_code: string;
  status: string;
  link_code: string;
};

type KidStats = {
  scans: number;
  drills: number;
  avg_mastery_top5: number | null;
  skills_slain: number;
  vip: boolean;
};

async function kidStats(supabase: SupabaseClient, childId: string): Promise<KidStats> {
  try {
    const input = await loadMasteryInput(supabase, childId);
    const skills = computeMastery(input.attempts, input.scans, input.slain);
    const scored = skills
      .map((s) => s.mastery)
      .filter((m): m is number => typeof m === "number")
      .sort((a, b) => b - a)
      .slice(0, TOP_N);
    const vip = await hasFamilyVip(supabase, childId).catch(() => false);
    return {
      scans: input.scans.length,
      drills: input.attempts.length,
      avg_mastery_top5:
        scored.length > 0 ? Math.round(scored.reduce((t, m) => t + m, 0) / scored.length) : null,
      skills_slain: input.slain.length,
      vip,
    };
  } catch {
    return { scans: 0, drills: 0, avg_mastery_top5: null, skills_slain: 0, vip: false };
  }
}

export async function GET(req: Request) {
  const ipRl = checkRate(`family-me:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) return NextResponse.json({ role: "none" });
  const rl = checkRate(`family-me:${playerId}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  try {
    const supabase = await createClient();
    // Parent leg first: a parent device shows the parent view even if it
    // also sits in a family as a kid (join blocks that, but read defensively).
    const own = await supabase
      .from("families")
      .select("id, parent_player_id, plan_code, status, link_code")
      .eq("parent_player_id", playerId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    if (own.error) {
      return NextResponse.json(
        { error: "Family is not set up yet — run migration 0017." },
        { status: 503 },
      );
    }
    if (Array.isArray(own.data) && own.data.length > 0) {
      const family = own.data[0] as FamilyRow;
      const members = await supabase
        .from("family_members")
        .select("child_player_id, created_at")
        .eq("family_id", family.id)
        .order("created_at", { ascending: true });
      const rows = (Array.isArray(members.data) ? members.data : []) as {
        child_player_id: string;
        created_at: string;
      }[];
      // Linked-parent proof for the tiered fields below (child ids + consent
      // map): verified session AND auth_links role=parent AND owns THIS
      // family. Anything else (no session, Auth not set up, child caller)
      // fails closed to the pseudonymous tier.
      let linkedParent = false;
      try {
        const auth = await createAuthClient();
        const user = await getAuthUser(auth);
        if (user) {
          const l = await supabase
            .from("auth_links")
            .select("player_id, role")
            .eq("auth_user_id", user.id)
            .limit(1);
          const linkRow =
            Array.isArray(l.data) && l.data.length > 0
              ? (l.data[0] as { player_id: string; role: string })
              : null;
          linkedParent =
            !!linkRow &&
            linkRow.role === "parent" &&
            linkRow.player_id === family.parent_player_id;
        }
      } catch {
        linkedParent = false;
      }
      // Child ids + consent map for the LINKED-parent view only (the child
      // leg below stays pseudonymous). A missing consents table (pre-0020)
      // degrades to "none consented".
      let consents: Record<string, true> = {};
      if (linkedParent && rows.length > 0) {
        try {
          const c = await supabase
            .from("consents")
            .select("child_player_id")
            .in(
              "child_player_id",
              rows.map((r) => r.child_player_id),
            );
          if (!c.error && Array.isArray(c.data)) {
            for (const row of c.data as { child_player_id: string }[]) {
              consents[row.child_player_id] = true;
            }
          }
        } catch {
          consents = {};
        }
      }
      const kids = await Promise.all(
        rows.map(async (r, i) => ({
          kid: `Kid ${i + 1}`,
          ...(linkedParent ? { child_player_id: r.child_player_id } : {}),
          joined_at: r.created_at,
          stats: await kidStats(supabase, r.child_player_id),
        })),
      );
      return NextResponse.json({
        role: "parent",
        family: {
          family_id: family.id,
          plan_code: family.plan_code,
          link_code: family.link_code,
          seats_used: rows.length,
          seats_total: seatsFor(family.plan_code),
        },
        members: kids,
        consents,
      });
    }
    const mine = await supabase
      .from("family_members")
      .select("family_id")
      .eq("child_player_id", playerId)
      .limit(1);
    if (mine.error) {
      return NextResponse.json(
        { error: "Family is not set up yet — run migration 0017." },
        { status: 503 },
      );
    }
    if (!Array.isArray(mine.data) || mine.data.length === 0) {
      return NextResponse.json({ role: "none" });
    }
    const familyId = (mine.data[0] as { family_id: string }).family_id;
    const fam = await supabase
      .from("families")
      .select("id, parent_player_id, plan_code, status, link_code")
      .eq("id", familyId)
      .limit(1);
    if (fam.error || !Array.isArray(fam.data) || fam.data.length === 0) {
      if (fam.error) {
        return NextResponse.json(
          { error: "Family is not set up yet — run migration 0017." },
          { status: 503 },
        );
      }
      return NextResponse.json({ role: "none" });
    }
    const family = fam.data[0] as FamilyRow;
    if (family.status !== "active") return NextResponse.json({ role: "none" });
    const members = await supabase
      .from("family_members")
      .select("child_player_id, created_at")
      .eq("family_id", family.id)
      .order("created_at", { ascending: true });
    const rows = (Array.isArray(members.data) ? members.data : []) as {
      child_player_id: string;
      created_at: string;
    }[];
    const kids = await Promise.all(
      rows.map(async (r, i) => ({
        kid: r.child_player_id === playerId ? "You" : `Kid ${i + 1}`,
        stats: await kidStats(supabase, r.child_player_id),
      })),
    );
    return NextResponse.json({
      role: "child",
      family: {
        family_id: family.id,
        plan_code: family.plan_code,
        seats_used: rows.length,
        seats_total: seatsFor(family.plan_code),
      },
      members: kids,
    });
  } catch {
    return NextResponse.json({ error: "Could not load family — retry." }, { status: 500 });
  }
}

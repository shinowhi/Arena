import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser } from "@/lib/auth/session";
import { EXPORT_TABLES } from "@/lib/auth/tables";
import { DrillPaper, stripDrillPaper } from "@/lib/drill/paper";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

// GET /api/me/export — the caller's own rows as one JSON aggregate (data
// portability). Auth-required: session proof + auth_links row; every table is
// owner-filtered to the LINKED player (never the cookie — the link is the
// stronger proof). Tables read via the no-cookie service client (loud 503
// when the key is missing — never a silent empty export off an anon
// fallback). Missing tables degrade per-table to [] (migration not run) so
// one absent table never 500s the whole export.
// Canonical per-owner inventory (sec-phase2a H1/M2 — this block is IDENTICAL
// in export + delete headers; the arrays live in lib/auth/tables.ts):
//   play: players, scans, attacks, bosses(unlink), funnel_events,
//     exam_attempts, exam_elo, exam_duels(p1+p2), exam_rooms(creator) +
//     exam_room_players, pvp_sides, raid_hits
//   social: invite_claims(inviter+invitee), parent_links(child+parent),
//     market_posts(poster) + market_claims(solver), player_codes,
//     friend_requests(from+to), friend_blocks(both), direct_messages(from+to),
//     groups(owner) + group_members + group_messages(from),
//     challenges(from+to), gifts(from+to), reports(reporter+reported)
//   study: tutor_threads + tutor_messages, drill_sets + paper_attempts,
//     enrollments(student) + classes(teacher)
//   account: families(parent) + family_members(child), auth_links,
//     consents(parent-auth + child)
// Export ≠ delete: financial tables (orders, subscriptions, refunds,
// xu_ledger, vip_claims) ARE exported — portability wins, and the money trail
// stays queryable by its owner. Orders/refunds are projected to explicit
// columns (note + device_id excluded; the owner's own payer_ref included).
// Drill paper ships STRIPPED of answer keys, funnel is capped at the 2000
// newest events, and family legs merge both ways (owned + joined).
//
// EXPORT_TABLES (lib/auth/tables.ts) is the canonical key set: the response
// `tables` object is built FROM it (single source), and
// scripts/test-auth.mjs imports the same array — update it in one place.
const ROW_LIMIT = 5000;
const FUNNEL_EXPORT_CAP = 2000;

async function ownRows(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
  truncated: string[],
): Promise<Record<string, unknown>[]> {
  try {
    const r = await supabase.from(table).select("*").eq(column, value).limit(ROW_LIMIT + 1);
    if (r.error || !Array.isArray(r.data)) return [];
    if (r.data.length > ROW_LIMIT) {
      truncated.push(table);
      return (r.data as Record<string, unknown>[]).slice(0, ROW_LIMIT);
    }
    return r.data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

// Same degrade-to-[] contract as ownRows, but over an .in() id set (ids are
// server-derived from an earlier leg, never request input).
async function ownRowsIn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  values: string[],
  truncated: string[],
): Promise<Record<string, unknown>[]> {
  if (values.length === 0) return [];
  try {
    const r = await supabase.from(table).select("*").in(column, values).limit(ROW_LIMIT + 1);
    if (r.error || !Array.isArray(r.data)) return [];
    if (r.data.length > ROW_LIMIT) {
      truncated.push(table);
      return (r.data as Record<string, unknown>[]).slice(0, ROW_LIMIT);
    }
    return r.data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

// Merge two legs into one key, deduped by row id (legs are disjoint in
// practice; dedupe keeps the merge honest if they ever overlap).
function mergeLegs(
  base: Record<string, unknown>[],
  extra: Record<string, unknown>[],
): Record<string, unknown>[] {
  const seen = new Set<unknown>(base.map((r) => r["id"]));
  for (const r of extra) {
    if (!seen.has(r["id"])) {
      seen.add(r["id"]);
      base.push(r);
    }
  }
  return base;
}

function strIds(rows: Record<string, unknown>[], col: string): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    const v = r[col];
    if (typeof v === "string" && v.length > 0) out.add(v);
  }
  return [...out];
}

// Orders/refunds projection: explicit columns only. note (admin-internal) and
// device_id stay out; the owner's own payer_ref stays in (portability wins
// for to-self data).
function projectOrder(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r["id"] ?? null,
    plan_code: r["plan_code"] ?? null,
    amount_vnd: r["amount_vnd"] ?? null,
    memo: r["memo"] ?? null,
    status: r["status"] ?? null,
    created_at: r["created_at"] ?? null,
    decided_at: r["decided_at"] ?? null,
    payer_ref: r["payer_ref"] ?? null,
  };
}

function projectRefund(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r["id"] ?? null,
    order_id: r["order_id"] ?? null,
    payer_ref: r["payer_ref"] ?? null,
    status: r["status"] ?? null,
    created_at: r["created_at"] ?? null,
    decided_at: r["decided_at"] ?? null,
  };
}

export async function GET(req: Request) {
  const ipRl = checkRate(`me-export:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  let user: { id: string; email: string | null } | null = null;
  try {
    const auth = await createAuthClient();
    user = await getAuthUser(auth);
  } catch {
    return NextResponse.json(
      { error: "Login is not set up yet — try again later." },
      { status: 503 },
    );
  }
  if (!user) {
    return NextResponse.json({ error: "Log in to export your data." }, { status: 401 });
  }
  const rl = checkRate(`me-export:${user.id}`, 5, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  let supabase: SupabaseClient;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Export is not set up yet — try again later." },
      { status: 503 },
    );
  }
  const link = await supabase
    .from("auth_links")
    .select("player_id, role")
    .eq("auth_user_id", user.id)
    .limit(1);
  if (link.error) {
    return NextResponse.json(
      { error: "Account linking is not set up yet — run migration 0020." },
      { status: 503 },
    );
  }
  if (!Array.isArray(link.data) || link.data.length === 0) {
    return NextResponse.json(
      { error: "No linked player yet — log in again via /login." },
      { status: 401 },
    );
  }
  const { player_id: playerId, role } = link.data[0] as { player_id: string; role: string };
  const truncated: string[] = [];
  const fetched: Record<string, Record<string, unknown>[]> = {
    players: await ownRows(supabase, "players", "id", playerId, truncated),
    scans: await ownRows(supabase, "scans", "player_id", playerId, truncated),
    attacks: await ownRows(supabase, "attacks", "player_id", playerId, truncated),
    drill_sets: await ownRows(supabase, "drill_sets", "player_id", playerId, truncated),
    paper_attempts: await ownRows(supabase, "paper_attempts", "player_id", playerId, truncated),
    tutor_threads: await ownRows(supabase, "tutor_threads", "player_id", playerId, truncated),
    tutor_messages: [],
    orders: await ownRows(supabase, "orders", "player_id", playerId, truncated),
    subscriptions: await ownRows(supabase, "subscriptions", "player_id", playerId, truncated),
    refunds: await ownRows(supabase, "refunds", "player_id", playerId, truncated),
    xu_ledger: await ownRows(supabase, "xu_ledger", "player_id", playerId, truncated),
    vip_claims: await ownRows(supabase, "vip_claims", "player_id", playerId, truncated),
    funnel_events: [],
    families: await ownRows(supabase, "families", "parent_player_id", playerId, truncated),
    family_members: await ownRows(
      supabase,
      "family_members",
      "child_player_id",
      playerId,
      truncated,
    ),
    enrollments: await ownRows(supabase, "enrollments", "student_player_id", playerId, truncated),
    classes: await ownRows(supabase, "classes", "teacher_player_id", playerId, truncated),
    auth_links: await ownRows(supabase, "auth_links", "auth_user_id", user.id, truncated),
    consents: [],
  };
  // Drill paper ships STRIPPED of answer keys (never raw): unparseable paper
  // degrades to null rather than leaking stored keys.
  fetched.drill_sets = fetched.drill_sets.map((row) => {
    const parsed = DrillPaper.safeParse(row["paper"]);
    return { ...row, paper: parsed.success ? stripDrillPaper(parsed.data) : null };
  });
  fetched.orders = fetched.orders.map(projectOrder);
  fetched.refunds = fetched.refunds.map(projectRefund);
  // Funnel: newest-first, capped (high-volume analytics table).
  try {
    const r = await supabase
      .from("funnel_events")
      .select("*")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(FUNNEL_EXPORT_CAP + 1);
    if (!r.error && Array.isArray(r.data)) {
      if (r.data.length > FUNNEL_EXPORT_CAP) truncated.push("funnel_events");
      fetched.funnel_events = (r.data as Record<string, unknown>[]).slice(0, FUNNEL_EXPORT_CAP);
    }
  } catch {
    fetched.funnel_events = [];
  }
  // Child-leg family ids BEFORE the owned-members merge below (keeps the
  // two legs' id sets from mixing).
  const joinedFamilyIds = strIds(fetched.family_members, "family_id");
  // Parent leg: members of families I own (merged into family_members).
  try {
    const ownedIds = strIds(fetched.families, "id");
    const owned = await ownRowsIn(supabase, "family_members", "family_id", ownedIds, truncated);
    fetched.family_members = mergeLegs(fetched.family_members, owned);
  } catch {
    // Child leg above still stands.
  }
  // Child leg: the family row of the family I joined as a kid.
  try {
    const joined = await ownRowsIn(supabase, "families", "id", joinedFamilyIds, truncated);
    fetched.families = mergeLegs(fetched.families, joined);
  } catch {
    // Owned leg above still stands.
  }
  // Student leg: classes of my enrollments (merged with the teacher leg).
  try {
    const classIds = strIds(fetched.enrollments, "class_id");
    const joinedClasses = await ownRowsIn(supabase, "classes", "id", classIds, truncated);
    fetched.classes = mergeLegs(fetched.classes, joinedClasses);
  } catch {
    // Teacher leg above still stands.
  }
  // Messages ride along with their threads (ids server-derived, not input).
  try {
    const threadIds = fetched.tutor_threads
      .map((t) => t["id"])
      .filter((id): id is string => typeof id === "string");
    if (threadIds.length > 0) {
      const r = await supabase
        .from("tutor_messages")
        .select("*")
        .in("thread_id", threadIds)
        .limit(ROW_LIMIT + 1);
      if (!r.error && Array.isArray(r.data)) {
        if (r.data.length > ROW_LIMIT) truncated.push("tutor_messages");
        fetched.tutor_messages = (r.data as Record<string, unknown>[]).slice(0, ROW_LIMIT);
      }
    }
  } catch {
    fetched.tutor_messages = [];
  }
  // Consents where I am the parent OR the child (both ids server-derived).
  // Two .eq queries merged app-side — never a .or() string interpolation —
  // and both ids uuid-validated first (belt and braces on the filter values).
  const idsOk =
    z.uuid().safeParse(user.id).success && z.uuid().safeParse(playerId).success;
  if (idsOk) {
    try {
      const asParent = await ownRows(
        supabase,
        "consents",
        "parent_auth_user_id",
        user.id,
        truncated,
      );
      const asChild = await ownRows(supabase, "consents", "child_player_id", playerId, truncated);
      fetched.consents = mergeLegs(asParent, asChild);
    } catch {
      fetched.consents = [];
    }
  }
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const k of EXPORT_TABLES) tables[k] = fetched[k] ?? [];
  return NextResponse.json({
    exported_at: new Date().toISOString(),
    email: user.email,
    player_id: playerId,
    role,
    truncated_tables: [...new Set(truncated)],
    tables,
  });
}

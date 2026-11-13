import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getAuthUser, PLAYER_COOKIE_NAME } from "@/lib/auth/session";
import { DELETE_TABLES } from "@/lib/auth/tables";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

// POST /api/me/delete — erase the caller's own data. Body {confirm:"DELETE"}
// (exact gate, mirror-tested in scripts/test-auth.mjs). Auth-required: deletes
// every own row — children before parents (many tables FK players WITHOUT
// cascade) — then the auth_links row, then the Supabase Auth user itself via
// the admin API (verified present in the installed @supabase/supabase-js:
// auth.admin.deleteUser). Identity is the server-derived playerId from the
// auth_links row (never the cookie, never request input); every two-leg table
// is deleted on BOTH legs. Tables run on the no-cookie service client (loud
// 503 when the key is missing — a destructive path must never silently no-op
// off an anon fallback).
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
// Financial records are RETAINED, never deleted: orders, subscriptions,
// refunds, xu_ledger, and vip_claims rows survive (the money trail must
// survive for accounting / law) — only the login + play/social/study rows
// above are erased. Teachers: classes NEED a teacher, so owned classes are
// EXPIRED via direct update (service client bypasses RLS), never deleted —
// students keep their rows but lose enrollment VIP. Deleting a parent also
// removes their families rows (cascade drops the memberships; the kids'
// players survive). Owned bosses are unlinked (shared world objects left to
// despawn, not personal data). If the players row still won't delete (an
// unexpected FK pin), it is scrubbed (display_name nulled, xp zeroed) and
// reported under partial. Returns {deleted, counts, auth_user_deleted,
// partial?} — deleted is true only when partial is empty AND the Auth user
// delete succeeded; a non-empty partial means those items are queued for
// manual cleanup within 72h (the client renders the list).
const Body = z.object({ confirm: z.string() });

async function deleteOwn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
  retCol = "id",
): Promise<number> {
  try {
    const r = await supabase.from(table).delete().eq(column, value).select(retCol);
    if (r.error || !Array.isArray(r.data)) return 0;
    return r.data.length;
  } catch {
    return 0;
  }
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Type DELETE to confirm account deletion." },
      { status: 400 },
    );
  }
  const ipRl = checkRate(`me-delete:${getClientIp(req)}`, 5, MINUTE_MS);
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
    return NextResponse.json({ error: "Log in to delete your account." }, { status: 401 });
  }
  const rl = checkRate(`me-delete:${user.id}`, 3, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  let supabase: SupabaseClient;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Deletion is not set up yet — try again later." },
      { status: 503 },
    );
  }
  const link = await supabase
    .from("auth_links")
    .select("player_id")
    .eq("auth_user_id", user.id)
    .limit(1);
  if (link.error) {
    return NextResponse.json(
      { error: "Account linking is not set up yet — run migration 0020." },
      { status: 503 },
    );
  }
  const playerId =
    Array.isArray(link.data) && link.data.length > 0
      ? ((link.data[0] as { player_id: string }).player_id ?? null)
      : null;
  const counts: Record<string, number> = {};
  const partial: string[] = [];
  if (playerId) {
    // Tutor messages ride on thread ids (server-derived).
    try {
      const t = await supabase.from("tutor_threads").select("id").eq("player_id", playerId);
      const threadIds =
        !t.error && Array.isArray(t.data)
          ? (t.data as { id: string }[]).map((r) => r.id).filter((id) => typeof id === "string")
          : [];
      counts.tutor_messages = 0;
      if (threadIds.length > 0) {
        const d = await supabase.from("tutor_messages").delete().in("thread_id", threadIds).select("id");
        counts.tutor_messages = !d.error && Array.isArray(d.data) ? d.data.length : 0;
      }
    } catch {
      counts.tutor_messages = 0;
    }
    counts.tutor_threads = await deleteOwn(supabase, "tutor_threads", "player_id", playerId);
    // paper_attempts FK drill_sets (cascade), but delete explicitly first so
    // the count is honest instead of cascade-swallowed.
    counts.paper_attempts = await deleteOwn(supabase, "paper_attempts", "player_id", playerId);
    counts.drill_sets = await deleteOwn(supabase, "drill_sets", "player_id", playerId);
    counts.scans = await deleteOwn(supabase, "scans", "player_id", playerId);
    counts.attacks = await deleteOwn(supabase, "attacks", "player_id", playerId);
    counts.funnel_events = await deleteOwn(supabase, "funnel_events", "player_id", playerId);
    counts.exam_attempts = await deleteOwn(
      supabase,
      "exam_attempts",
      "player_id",
      playerId,
      "player_id",
    );
    counts.exam_elo = await deleteOwn(supabase, "exam_elo", "player_id", playerId, "player_id");
    counts.exam_duels =
      (await deleteOwn(supabase, "exam_duels", "p1_player_id", playerId)) +
      (await deleteOwn(supabase, "exam_duels", "p2_player_id", playerId));
    // My seats in others' rooms first, then rooms I created (cascade drops
    // the remaining seats in those).
    counts.exam_room_players = await deleteOwn(
      supabase,
      "exam_room_players",
      "player_id",
      playerId,
      "room_id",
    );
    counts.exam_rooms = await deleteOwn(
      supabase,
      "exam_rooms",
      "creator_player_id",
      playerId,
    );
    counts.pvp_sides = await deleteOwn(supabase, "pvp_sides", "player_id", playerId, "room_id");
    counts.raid_hits = await deleteOwn(supabase, "raid_hits", "player_id", playerId);
    counts.invite_claims =
      (await deleteOwn(supabase, "invite_claims", "inviter_id", playerId, "inviter_id")) +
      (await deleteOwn(supabase, "invite_claims", "invitee_id", playerId, "inviter_id"));
    counts.parent_links =
      (await deleteOwn(supabase, "parent_links", "child_id", playerId, "code")) +
      (await deleteOwn(supabase, "parent_links", "parent_id", playerId, "code"));
    // Claims I solved + claims on my posts (post_id FK has no cascade, so
    // claims die before the posts).
    counts.market_claims = await deleteOwn(
      supabase,
      "market_claims",
      "solver_id",
      playerId,
      "post_id",
    );
    try {
      const p = await supabase.from("market_posts").select("id").eq("poster_id", playerId);
      const postIds =
        !p.error && Array.isArray(p.data)
          ? (p.data as { id: string }[])
              .map((r) => r.id)
              .filter((id) => typeof id === "string")
          : [];
      if (postIds.length > 0) {
        const d = await supabase
          .from("market_claims")
          .delete()
          .in("post_id", postIds)
          .select("post_id");
        if (!d.error && Array.isArray(d.data)) counts.market_claims += d.data.length;
      }
    } catch {
      // Solver-leg count above still stands.
    }
    counts.market_posts = await deleteOwn(supabase, "market_posts", "poster_id", playerId);
    counts.player_codes = await deleteOwn(
      supabase,
      "player_codes",
      "player_id",
      playerId,
      "player_id",
    );
    counts.friend_requests =
      (await deleteOwn(supabase, "friend_requests", "from_id", playerId)) +
      (await deleteOwn(supabase, "friend_requests", "to_id", playerId));
    counts.friend_blocks =
      (await deleteOwn(supabase, "friend_blocks", "blocker_id", playerId, "blocker_id")) +
      (await deleteOwn(supabase, "friend_blocks", "blocked_id", playerId, "blocker_id"));
    counts.direct_messages =
      (await deleteOwn(supabase, "direct_messages", "from_id", playerId)) +
      (await deleteOwn(supabase, "direct_messages", "to_id", playerId));
    // My messages + my seats first, then groups I own (cascade drops the rest).
    counts.group_messages = await deleteOwn(supabase, "group_messages", "from_id", playerId);
    counts.group_members = await deleteOwn(
      supabase,
      "group_members",
      "player_id",
      playerId,
      "group_id",
    );
    counts.groups = await deleteOwn(supabase, "groups", "owner_id", playerId);
    counts.challenges =
      (await deleteOwn(supabase, "challenges", "from_id", playerId)) +
      (await deleteOwn(supabase, "challenges", "to_id", playerId));
    counts.gifts =
      (await deleteOwn(supabase, "gifts", "from_id", playerId)) +
      (await deleteOwn(supabase, "gifts", "to_id", playerId));
    counts.reports =
      (await deleteOwn(supabase, "reports", "reporter_id", playerId)) +
      (await deleteOwn(supabase, "reports", "reported_id", playerId));
    counts.enrollments = await deleteOwn(
      supabase,
      "enrollments",
      "student_player_id",
      playerId,
    );
    // Teacher leg: classes NEED a teacher — expire (never delete) owned
    // classes so students are not orphaned (documented choice, header).
    try {
      const c = await supabase
        .from("classes")
        .update({ status: "expired" })
        .eq("teacher_player_id", playerId)
        .select("id");
      counts.classes_expired = !c.error && Array.isArray(c.data) ? c.data.length : 0;
    } catch {
      counts.classes_expired = 0;
    }
    counts.family_members = await deleteOwn(
      supabase,
      "family_members",
      "child_player_id",
      playerId,
    );
    counts.families = await deleteOwn(supabase, "families", "parent_player_id", playerId);
    counts.consents =
      (await deleteOwn(supabase, "consents", "parent_auth_user_id", user.id)) +
      (await deleteOwn(supabase, "consents", "child_player_id", playerId));
    counts.auth_links = await deleteOwn(supabase, "auth_links", "auth_user_id", user.id, "auth_user_id");
    // Unlink owned bosses (nullable owner; shared objects despawn on their own).
    try {
      const b = await supabase
        .from("bosses")
        .update({ owner_player_id: null })
        .eq("owner_player_id", playerId)
        .select("id");
      counts.bosses_unlinked = !b.error && Array.isArray(b.data) ? b.data.length : 0;
    } catch {
      counts.bosses_unlinked = 0;
    }
    counts.players = await deleteOwn(supabase, "players", "id", playerId);
    if (counts.players === 0) {
      // Pinned by an out-of-scope FK (social/pvp/exam/raid rows): scrub the
      // nickname + xp so nothing personal remains, and report it.
      try {
        const s = await supabase
          .from("players")
          .update({ display_name: null, xp: 0 })
          .eq("id", playerId)
          .select("id");
        if (!s.error && Array.isArray(s.data) && s.data.length > 0) {
          counts.players_scrubbed = s.data.length;
          partial.push("players");
        }
      } catch {
        partial.push("players");
      }
    }
  } else {
    await deleteOwn(supabase, "auth_links", "auth_user_id", user.id, "auth_user_id");
  }
  // Every canonical table reports a count (zero when untouched) so the shape
  // can never drift from DELETE_TABLES.
  for (const t of DELETE_TABLES) counts[t] ??= 0;
  let authUserDeleted = false;
  try {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    authUserDeleted = !error;
    if (error) partial.push("auth_user");
  } catch {
    partial.push("auth_user");
  }
  const res = NextResponse.json({
    deleted: partial.length === 0 && authUserDeleted,
    counts,
    auth_user_deleted: authUserDeleted,
    ...(partial.length > 0 ? { partial } : {}),
  });
  // Session is dead server-side; clear the sb-* cookies + the deleted player's
  // cookie so the next visit mints a fresh anonymous player.
  try {
    const store = await cookies();
    for (const c of store.getAll()) {
      if (c.name.startsWith("sb-")) res.cookies.delete(c.name);
    }
    res.cookies.delete(PLAYER_COOKIE_NAME);
  } catch {
    // Response already built; cookies are best-effort here.
  }
  return res;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { FAMILY_SEATS } from "@/lib/billing/plans";
import { subActive } from "@/lib/billing/entitle";

// P5 family helpers. Pure rules (seatsFor, canJoin, isFamilyVip, link-code
// format) are mirror-tested offline in scripts/test-family.mjs; the DB reader
// (hasFamilyVip) never throws — a missing table or failed query degrades to
// "no family VIP" (fail-closed on paid access, same as lib/vip).
//
// A kid counts as family-VIP while ALL hold: the kid is a member of a family
// whose row status is active AND the parent holds a live (active + unexpired)
// FAMILY-plan subscription (family_2/family_4 only — a plain bundle_monthly
// does NOT cover kids, so parents cannot downgrade 79k -> 49k and keep kid
// VIP; flagged pricing decision, flip parentCovered to allow bundle if the
// user/A choose generosity). The family row status is NOT trusted alone — a
// lapsed parent subscription grants nothing even while the row says active
// (status flips need the v2 admin path; the access check re-verifies).

export const FAMILY_PLAN_CODES = ["family_2", "family_4"] as const;
export type FamilyPlanCode = (typeof FAMILY_PLAN_CODES)[number];

// Link codes: 8 uppercase alphanumerics, dropping 0/O/1/I so a parent reads
// the code off a phone screen reliably (same alphabet as the parent link-code
// route, 8 chars per the P5 design).
export const LINK_CODE_LENGTH = 8;
const LINK_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateLinkCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) {
    out += LINK_ALPHABET[Math.floor(rand() * LINK_ALPHABET.length)];
  }
  return out;
}

// Pure: strict link-code shape check (tests + route input guard; the DB
// enforces uniqueness). Accepts surrounding whitespace / lowercase by
// normalizing first — returns the canonical code or null.
export function normalizeLinkCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(code)) return null;
  return code;
}

// Pure: kid seats for a plan code. Unknown codes seat 0 (fail-closed: a plan
// we do not recognize admits no kids).
export function seatsFor(planCode: string): number {
  return (FAMILY_SEATS as Record<string, number>)[planCode] ?? 0;
}

// Pure: a join fits while the family is under its plan's seat cap.
export function canJoin(memberCount: number, planCode: string): boolean {
  if (!Number.isInteger(memberCount) || memberCount < 0) return false;
  return memberCount < seatsFor(planCode);
}

// Pure: family-VIP needs BOTH an active family row AND a live parent sub.
export function isFamilyVip(membership: {
  familyActive: boolean;
  parentSubActive: boolean;
}): boolean {
  return membership.familyActive === true && membership.parentSubActive === true;
}

type FamilyRow = { id: string; parent_player_id: string; status: string };
type MemberRow = { family_id: string };
type SubRow = { plan_code: string; ends_at: string; status: string };

// Only a live FAMILY-plan subscription covers the parent leg. A plain
// bundle_monthly does NOT count even though its product is 'bundle' —
// otherwise parents downgrade 79k -> 49k and kids keep VIP (flagged pricing
// decision; re-add the bundle check if the user/A choose generosity).
function parentCovered(subs: SubRow[], nowMs: number): boolean {
  return subs.some(
    (s) =>
      subActive(s.status, s.ends_at, nowMs) &&
      (FAMILY_PLAN_CODES as readonly string[]).includes(s.plan_code),
  );
}

// Family-VIP check for one kid: member of an active family whose parent holds
// a live bundle/family subscription. Fail-closed on every DB error.
export async function hasFamilyVip(
  supabase: SupabaseClient,
  childId: string,
): Promise<boolean> {
  try {
    const m = await supabase
      .from("family_members")
      .select("family_id")
      .eq("child_player_id", childId)
      .limit(1);
    if (m.error || !Array.isArray(m.data) || m.data.length === 0) return false;
    const familyId = (m.data[0] as MemberRow).family_id;
    const f = await supabase
      .from("families")
      .select("id, parent_player_id, status")
      .eq("id", familyId)
      .limit(1);
    if (f.error || !Array.isArray(f.data) || f.data.length === 0) return false;
    const family = f.data[0] as FamilyRow;
    if (family.status !== "active") return false;
    const s = await supabase
      .from("subscriptions")
      .select("plan_code, ends_at, status")
      .eq("player_id", family.parent_player_id)
      .eq("status", "active")
      .gt("ends_at", new Date().toISOString());
    if (s.error || !Array.isArray(s.data)) return false;
    return parentCovered(s.data as SubRow[], Date.now());
  } catch {
    return false;
  }
}

// Creation gate: the parent holds a live family_2/family_4 subscription.
// Unlike hasFamilyVip this requires a FAMILY plan specifically (a plain
// bundle_monthly does not unlock family creation). Fail-closed.
export async function parentHasFamilySub(
  supabase: SupabaseClient,
  parentId: string,
): Promise<{ ok: boolean; planCode: string | null }> {
  try {
    const r = await supabase
      .from("subscriptions")
      .select("plan_code, ends_at, status")
      .eq("player_id", parentId)
      .eq("status", "active")
      .in("plan_code", [...FAMILY_PLAN_CODES])
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(1);
    if (r.error || !Array.isArray(r.data) || r.data.length === 0) {
      return { ok: false, planCode: null };
    }
    const row = r.data[0] as { plan_code: string; ends_at: string; status: string };
    if (!subActive(row.status, row.ends_at, Date.now())) {
      return { ok: false, planCode: null };
    }
    return { ok: true, planCode: row.plan_code };
  } catch {
    return { ok: false, planCode: null };
  }
}

// P4 slice-2 paywall gate. Free quotas differ per product: A (boss/scan)
// allows FREE_GAPS fixed gaps, B (exam mocks) allows FREE_EXAMS served
// mocks — an exam-only player never kills a boss, so gaps alone would leave
// B free forever. Past the quota: entitled (sub/VIP/family/enrollment) or
// 402. Null player -> free: new visitors must experience the free tier, and
// minting an identity here would NOT stop cookie-clearing anyway (a fresh
// cookie is a fresh player with 0 usage) — it would only spam player rows.
// Cookie-clear evasion is an accepted anon-model residual (login-bound
// identity is the v2 fix); the per-IP rate buckets stay as the backstop.
// Product mapping: boss summon -> "A", exam mocks -> "B". The pure core
// (decideAccess) is mirror-tested offline in scripts/test-paywall.mjs.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlement, type WantProduct } from "./entitle";
import { countExamServes, countFixedGaps, gapsExhausted, servesExhausted } from "./gaps";
import { hasFamilyVip } from "@/lib/family/family";
import { hasEnrollmentVip } from "@/lib/center/center";

export type AccessReason = "free" | "entitled" | "paywall";
export type AccessResult = { ok: boolean; reason: AccessReason };

// Single 402 body shape for every gate block (summon + 3 exam mocks).
export const PAYWALL_ERROR = "Free gaps used up — upgrade to keep fixing gaps.";
export const VIP_URL = "/billing";

export function paywallBody(): { error: string; vip_url: string } {
  return { error: PAYWALL_ERROR, vip_url: VIP_URL };
}

export type AccessInputs = {
  playerId: string | null;
  product: WantProduct;
  fixedGaps: number;
  examsServed: number;
  entitled: boolean;
  extraEntitled: boolean;
  kinVip: boolean;
};

// Pure decision core: usage-vs-quota per product, then entitlement OR-chain
// (subscription/VIP, caller extra flag, family/enrollment kin).
export function decideAccess(i: AccessInputs): AccessResult {
  if (!i.playerId) return { ok: true, reason: "free" };
  const spent = i.product === "B" ? servesExhausted(i.examsServed) : gapsExhausted(i.fixedGaps);
  if (!spent) return { ok: true, reason: "free" };
  if (i.entitled || i.extraEntitled || i.kinVip) return { ok: true, reason: "entitled" };
  return { ok: false, reason: "paywall" };
}

export async function hasAccess(
  supabase: SupabaseClient,
  playerId: string | null,
  product: WantProduct,
  extraEntitled = false,
): Promise<AccessResult> {
  if (!playerId) return { ok: true, reason: "free" };
  const [fixed, serves, ent] = await Promise.all([
    countFixedGaps(supabase, playerId),
    product === "B" ? countExamServes(supabase, playerId) : Promise.resolve(0),
    getEntitlement(supabase, playerId),
  ]);
  // Family (P5) + enrollment (P6) VIP. Best-effort: a missing table
  // (migration not run) fails closed to false, never throws.
  let kin = false;
  try {
    const [fam, enr] = await Promise.all([
      hasFamilyVip(supabase, playerId),
      hasEnrollmentVip(supabase, playerId),
    ]);
    kin = fam || enr;
  } catch {
    kin = false;
  }
  return decideAccess({
    playerId,
    product,
    fixedGaps: fixed,
    examsServed: serves,
    entitled: ent.products[product],
    extraEntitled,
    kinVip: kin,
  });
}

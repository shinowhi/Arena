// P4 billing catalog (slice-1 infra). Single constants file for every
// coordinator-flagged assumption so the user / Agent A can override in one
// line: plan prices, hero plan, memo format. Mirrors the 0016 seed rows —
// update the seed INSERT in supabase/migrations/0016_billing.sql to match.
//
// PRICES ARE PLACEHOLDERS pending user/A confirm (29k/29k/49k/490k VND,
// family 79k/119k VND — coordinator locks, confirm with user/A).
//
// FAMILY PLANS (P5, appended — mirrors the 0017 seed rows; update the seed
// INSERT in supabase/migrations/0017_family.sql to match):
//   family_2  79,000 VND / 30 days (product bundle, 2 kid seats)
//   family_4 119,000 VND / 30 days (product bundle, 4 kid seats)

export type PlanProduct = "A" | "B" | "bundle";
export type PlanCode =
  | "scan_monthly"
  | "exam_monthly"
  | "bundle_monthly"
  | "bundle_yearly"
  | "family_2"
  | "family_4";

export type Plan = {
  code: PlanCode;
  name: string;
  product: PlanProduct;
  price_vnd: number;
  period_days: number;
};

export const PLANS: Record<PlanCode, Plan> = {
  scan_monthly: {
    code: "scan_monthly",
    name: "Study Unlock",
    product: "A",
    price_vnd: 29000,
    period_days: 30,
  },
  exam_monthly: {
    code: "exam_monthly",
    name: "Exam Packs",
    product: "B",
    price_vnd: 29000,
    period_days: 30,
  },
  bundle_monthly: {
    code: "bundle_monthly",
    name: "Bundle",
    product: "bundle",
    price_vnd: 49000,
    period_days: 30,
  },
  bundle_yearly: {
    code: "bundle_yearly",
    name: "Bundle Yearly",
    product: "bundle",
    price_vnd: 490000,
    period_days: 365,
  },
  family_2: {
    code: "family_2",
    name: "Family 2 kids",
    product: "bundle",
    price_vnd: 79000,
    period_days: 30,
  },
  family_4: {
    code: "family_4",
    name: "Family 4 kids",
    product: "bundle",
    price_vnd: 119000,
    period_days: 30,
  },
};

// Kid seats per family plan (P5 single constant — mirrors the 0017 header).
export const FAMILY_SEATS: Record<"family_2" | "family_4", number> = {
  family_2: 2,
  family_4: 4,
};

export const PLAN_CODES = Object.keys(PLANS) as PlanCode[];

// Featured plan on pricing surfaces (slice-2 paywall).
export const HERO_PLAN: PlanCode = "bundle_monthly";

// Refund window in days from first purchase (USER LOCK). Enforced MANUALLY by
// the admin for now — zero automation code in slice-1 (see 0016 header).
export const REFUND_DAYS = 5;

// Order memo: ARENA- + 6 uppercase alphanumerics (the alphabet below drops
// 0/O/1/I so buyers read it off a bank receipt reliably). Format is a
// coordinator-flagged assumption — confirm with user/A.
export const MEMO_PREFIX = "ARENA-";
const MEMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateMemo(rand: () => number = Math.random): string {
  let tail = "";
  for (let i = 0; i < 6; i += 1) {
    tail += MEMO_ALPHABET[Math.floor(rand() * MEMO_ALPHABET.length)];
  }
  return `${MEMO_PREFIX}${tail}`;
}

// Pure: strict memo shape check (used by tests; the DB enforces uniqueness).
export function isMemoValid(memo: unknown): boolean {
  return (
    typeof memo === "string" && /^ARENA-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(memo)
  );
}

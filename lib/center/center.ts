// P6 CENTER helpers. Single constants file for every coordinator-flagged
// assumption: tier prices/seats, hero tier, join-code alphabet. Mirrors the
// 0018 seed rows — update the seed INSERT in
// supabase/migrations/0018_center.sql to match.
//
// PRICES ARE PLACEHOLDERS pending user confirm (780k/999k/1.49M VND).
//
// DESIGN LOCK 17 B3: per-class pricing; center students get FULL VIP plus
// teacher assignments; VIP is gated ONLY on active enrollment in an ACTIVE
// class — no purchase needed, no other path grants it.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClassTierCode = "class_20" | "class_30" | "class_50";
export type ClassStatus = "pending" | "active" | "expired" | "cancelled";

export type ClassTier = {
  code: ClassTierCode;
  name: string;
  seats: number;
  price_vnd: number;
  period_days: number;
  hero: boolean;
};

export const CLASS_TIERS: Record<ClassTierCode, ClassTier> = {
  class_20: {
    code: "class_20",
    name: "Center Class 20",
    seats: 20,
    price_vnd: 780000,
    period_days: 30,
    hero: false,
  },
  class_30: {
    code: "class_30",
    name: "Center Class 30",
    seats: 30,
    price_vnd: 999000,
    period_days: 30,
    hero: true,
  },
  class_50: {
    code: "class_50",
    name: "Center Class 50",
    seats: 50,
    price_vnd: 1490000,
    period_days: 30,
    hero: false,
  },
};

export const CLASS_TIER_CODES = Object.keys(CLASS_TIERS) as ClassTierCode[];

// Featured tier on the center pricing table.
export const HERO_CLASS_TIER: ClassTierCode = "class_30";

// Pure: seats for a tier code, or null for unknown codes. The create-class
// route derives seats from the plan row, but falls back to this map.
export function seatsFor(planCode: string): number | null {
  const tier = (CLASS_TIERS as Record<string, ClassTier>)[planCode];
  return tier ? tier.seats : null;
}

export function isClassTierCode(code: unknown): code is ClassTierCode {
  return typeof code === "string" && code in CLASS_TIERS;
}

export function isClassStatus(status: unknown): status is ClassStatus {
  return status === "pending" || status === "active" || status === "expired" || status === "cancelled";
}

// Join codes: CENTER- + 6 uppercase alphanumerics (same unambiguous alphabet
// as order memos — drops 0/O/1/I so students read them off a board).
export const JOIN_CODE_PREFIX = "CENTER-";
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(rand: () => number = Math.random): string {
  let tail = "";
  for (let i = 0; i < 6; i += 1) {
    tail += JOIN_CODE_ALPHABET[Math.floor(rand() * JOIN_CODE_ALPHABET.length)];
  }
  return `${JOIN_CODE_PREFIX}${tail}`;
}

// Pure: canonicalize a pasted code (trim, uppercase), or null when the shape
// is wrong. Used by the join route; mirrored in scripts/test-center.mjs.
export function normalizeJoinCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!/^CENTER-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) return null;
  return code;
}

type EnrollmentVipRow = {
  active: boolean;
  classes: { status: string } | Array<{ status: string }> | null;
};

type TeacherRow = { teacher_player_id: string };

// Enrollment VIP: true ONLY when the student holds at least one ACTIVE
// enrollment in an ACTIVE class. No purchase needed, no other path grants
// it. Missing tables / DB errors degrade to false (fail closed).
export async function hasEnrollmentVip(
  supabase: SupabaseClient,
  studentId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("enrollments")
      .select("active, classes!inner(status)")
      .eq("student_player_id", studentId)
      .eq("active", true)
      .limit(50);
    if (error || !Array.isArray(data)) return false;
    return (data as EnrollmentVipRow[]).some((row) => {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes;
      return row.active === true && cls?.status === "active";
    });
  } catch {
    return false;
  }
}

// True when playerId teaches classId. Missing tables / DB errors degrade to
// false (fail closed: the assignment route denies).
export async function isTeacher(
  supabase: SupabaseClient,
  playerId: string,
  classId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("classes")
      .select("teacher_player_id")
      .eq("id", classId)
      .single();
    if (error || !data) return false;
    return (data as TeacherRow).teacher_player_id === playerId;
  } catch {
    return false;
  }
}

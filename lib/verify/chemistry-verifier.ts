import { verifyAnswer, type CheckSpec } from "./math-verifier.ts";

// Verifies THPT Chemistry (Hoa hoc 10-12) questions whose answers are NUMERIC
// by recomputing them with mathjs. Never trust the answer_numeric coming
// from the LLM. Chemistry computations are closed-form arithmetic (including
// log/pow), so only the "numeric" check kind is accepted here: derivative/
// integral/limit probes are calculus-only and meaningless at chemistry scales.

// Canonical constants for prompt authors and tests. Generators must bake
// plain numbers into prompt_expr (never names); these document the values.
export const CHEMISTRY_CONSTANTS = {
  // Avogadro number in mol^-1.
  NA_AVOGADRO: 6.022e23,
  // Molar volume of an ideal gas at dktc (0 C, 1 atm) in L/mol (THPT value).
  MOLAR_VOLUME_STP: 22.4,
  // Ideal-gas constant in J/(mol.K).
  R_GAS: 8.31,
  // Ideal-gas constant in L.atm/(mol.K).
  R_L_ATM: 0.082,
  // Water ion product at 25 C.
  KW: 1e-14,
  // Faraday constant in C/mol.
  F_FARADAY: 96500,
  // Volume conversions.
  L_TO_ML: 1000,
  M3_TO_L: 1000,
} as const;

// Standard atomic masses (g/mol) used across THPT Chemistry stems.
// Generators bake these numbers into prompt_expr; the table pins the values.
export const CHEMISTRY_ATOMIC_MASSES: Record<string, number> = {
  H: 1,
  C: 12,
  N: 14,
  O: 16,
  Na: 23,
  Mg: 24,
  Al: 27,
  S: 32,
  Cl: 35.5,
  K: 39,
  Ca: 40,
  Fe: 56,
  Cu: 64,
  Zn: 65,
  Ag: 108,
  Ba: 137,
};

// Expected answer unit per chemistry skill. Units live in the prompt only
// (answer_numeric is always a raw number); this registry documents the
// wanted-unit contract the generator prompts enforce.
export const CHEMISTRY_SKILL_UNITS: Record<string, string[]> = {
  che_atomic_structure: ["u", "g", "count"],
  che_periodic_table: ["group", "period", "Z"],
  che_chemical_bonding: ["count", "e"],
  che_mole_stoichiometry: ["mol", "g", "g/mol", "L"],
  che_redox: ["e", "count"],
  che_reaction_rate: ["M/s", "mol", "s"],
  che_chemical_equilibrium: ["M", "count"],
  che_acid_base_ph: ["pH", "M"],
  che_solutions_concentration: ["M", "%", "g", "mL", "L"],
  che_nitrogen_compounds: ["mol", "g", "L"],
  che_sulfur_compounds: ["mol", "g", "L"],
  che_organic_basics: ["mol", "g", "g/mol", "L"],
  che_hydrocarbons: ["mol", "g", "L"],
  che_alcohols_phenols: ["mol", "g", "mL", "L"],
  che_aldehydes_acids: ["mol", "g", "L"],
  che_esters_fats: ["mol", "g", "mg"],
  che_amines_amino: ["mol", "g"],
  che_polymers: ["g/mol", "count", "g"],
  che_metals: ["g", "mol", "V"],
  che_electrolysis: ["g", "A", "s", "C", "mol"],
};

export function expectedUnits(skillTag: string): string[] {
  return CHEMISTRY_SKILL_UNITS[skillTag] ?? [];
}

// Tolerance rule shared by generator prompts and tests: 0.1% of the
// answer magnitude, at least 0.001.
export function chemistryTolerance(answer: number): number {
  if (!Number.isFinite(answer)) return 0.001;
  return Math.max(0.001, Math.abs(answer) * 0.001);
}

// Chemistry accepts numeric checks only (see module note).
export function isChemistryCheck(check: CheckSpec): boolean {
  return check.kind === "numeric";
}

// True when the check is chemistry-legal and the recomputed value matches
// the claim within tolerance. Throws nothing.
export function verifyChemistryAnswer(check: CheckSpec, claimed: number, tolerance: number): boolean {
  if (!isChemistryCheck(check)) return false;
  return verifyAnswer(check, claimed, tolerance);
}

// Drill/boss grading of one numeric answer: blanks (null) are always
// wrong, never coerced to zero. Throws nothing.
export function gradeNumeric(expected: number, given: number | null, tolerance: number): boolean {
  if (given === null || !Number.isFinite(given)) return false;
  if (!Number.isFinite(expected) || !Number.isFinite(tolerance)) return false;
  return Math.abs(expected - given) <= Math.max(tolerance, 1e-6);
}

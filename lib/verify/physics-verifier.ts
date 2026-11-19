import { verifyAnswer, type CheckSpec } from "./math-verifier.ts";

// Verifies THPT Physics (Vat ly 10-12) questions whose answers are NUMERIC
// by recomputing them with mathjs. Never trust the answer_numeric coming
// from the LLM. Physics computations are closed-form arithmetic, so only
// the "numeric" check kind is accepted here: derivative/integral/limit
// probes are calculus-only and numerically fragile at physics scales.

// Canonical constants for prompt authors and tests. Generators must bake
// plain numbers into prompt_expr (never names); these document the values.
export const PHYSICS_CONSTANTS = {
  // Mechanics: THPT takes g = 10 unless the stem says 9.8.
  G_THPT: 10,
  G: 9.8,
  // Electrostatics: Coulomb constant in N.m^2/C^2.
  K_COULOMB: 9e9,
  // Elementary charge in C.
  E_CHARGE: 1.6e-19,
  // Vacuum light speed in m/s.
  C_LIGHT: 3e8,
  // Planck constant in J.s.
  H_PLANCK: 6.625e-34,
  // Electron rest energy in eV (u = 931.5 MeV/c^2 lives in stems).
  U_MEV: 931.5,
  // Ideal-gas constant in J/(mol.K).
  R_GAS: 8.31,
  // Energy conversions.
  EV_TO_J: 1.6e-19,
  KWH_TO_J: 3.6e6,
} as const;

// Expected answer unit per physics skill. Units live in the prompt only
// (answer_numeric is always a raw number); this registry documents the
// wanted-unit contract the generator prompts enforce.
export const PHYSICS_SKILL_UNITS: Record<string, string[]> = {
  phy_kinematics: ["m", "m/s", "m/s^2", "s"],
  phy_newton_laws: ["N", "kg", "m/s^2"],
  phy_circular_motion: ["N", "m/s", "rad/s", "Hz"],
  phy_work_energy: ["J", "W", "m/s", "m"],
  phy_momentum: ["kg.m/s", "N.s", "m/s"],
  phy_static_equilibrium: ["N", "N.m"],
  phy_fluid_pressure: ["Pa", "kPa", "N", "kg/m^3"],
  phy_oscillations: ["s", "Hz", "rad/s", "cm", "m"],
  phy_mechanical_waves: ["m", "m/s", "Hz", "s"],
  phy_electrostatics: ["N", "V/m", "V", "C"],
  phy_dc_circuits: ["V", "A", "Ω", "W", "J"],
  phy_magnetism: ["T", "N", "Wb"],
  phy_induction: ["V", "Wb", "T", "A"],
  phy_lc_circuit: ["s", "Hz", "rad/s", "H", "F"],
  phy_ac_circuits: ["V", "A", "Ω", "W", "Hz"],
  phy_em_waves: ["m", "Hz", "m/s"],
  phy_wave_optics: ["μm", "mm", "m"],
  phy_geometric_optics: ["cm", "m", "dp"],
  phy_photoelectric: ["J", "eV", "m", "Hz"],
  phy_atomic_nucleus: ["u", "MeV", "kg"],
  phy_nuclear_reactions: ["MeV", "u"],
  phy_ideal_gas: ["Pa", "K", "mol", "J", "m^3", "L"],
};

export function expectedUnits(skillTag: string): string[] {
  return PHYSICS_SKILL_UNITS[skillTag] ?? [];
}

// Tolerance rule shared by generator prompts and tests: 0.1% of the
// answer magnitude, at least 0.001.
export function physicsTolerance(answer: number): number {
  if (!Number.isFinite(answer)) return 0.001;
  return Math.max(0.001, Math.abs(answer) * 0.001);
}

// Physics accepts numeric checks only (see module note).
export function isPhysicsCheck(check: CheckSpec): boolean {
  return check.kind === "numeric";
}

// True when the check is physics-legal and the recomputed value matches
// the claim within tolerance. Throws nothing.
export function verifyPhysicsAnswer(check: CheckSpec, claimed: number, tolerance: number): boolean {
  if (!isPhysicsCheck(check)) return false;
  return verifyAnswer(check, claimed, tolerance);
}

// Drill/boss grading of one numeric answer: blanks (null) are always
// wrong, never coerced to zero. Throws nothing.
export function gradeNumeric(expected: number, given: number | null, tolerance: number): boolean {
  if (given === null || !Number.isFinite(given)) return false;
  if (!Number.isFinite(expected) || !Number.isFinite(tolerance)) return false;
  return Math.abs(expected - given) <= Math.max(tolerance, 1e-6);
}

import { z } from "zod";
import type { BossQuestion as SharedBossQuestion } from "../agents/boss-generator";
import type { DrillQuestion as SharedDrillQuestion, StrippedDrillQ as SharedStrippedDrillQ } from "../drill/paper";

// Physics drill-set wiring: assemble keyed server-side drill papers from
// cached per-skill boss sets (round-robin across skills, level by level,
// same interleave as the weak-skills drill source). The server stores the
// FULL paper WITH keys; stripPhysicsDrill removes answer_numeric AND the
// check spec before anything reaches the client.

// NOTE: the schemas below mirror BossQuestion/DrillQuestion/StrippedDrillQ
// instead of importing them, because those modules use the "@..." path
// alias and extensionless imports, which plain node cannot resolve for
// offline tests. DRILL_CONTRACTS_LOCKED breaks tsc if either side drifts.
const PhysicsBossCheck = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);

const PhysicsBossBase = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  answer_numeric: z.number(),
  tolerance: z.number().positive(),
  hint: z.string(),
  check: PhysicsBossCheck,
});

export const PhysicsDrillQuestion = PhysicsBossBase.extend({ skill_tag: z.string().min(1) });
export type PhysicsDrillQuestion = z.infer<typeof PhysicsDrillQuestion>;

type PhysicsBossBaseShape = z.infer<typeof PhysicsBossBase>;

export const DRILL_CONTRACTS_LOCKED: [
  PhysicsBossBaseShape extends SharedBossQuestion ? true : never,
  SharedBossQuestion extends PhysicsBossBaseShape ? true : never,
  PhysicsDrillQuestion extends SharedDrillQuestion ? true : never,
  SharedDrillQuestion extends PhysicsDrillQuestion ? true : never,
  StrippedPhysicsDrillQ extends SharedStrippedDrillQ ? true : never,
  SharedStrippedDrillQ extends StrippedPhysicsDrillQ ? true : never,
] = [true, true, true, true, true, true];

export const PhysicsDrillPaper = z.object({
  questions: z.array(PhysicsDrillQuestion).min(1).max(20),
});
export type PhysicsDrillPaper = z.infer<typeof PhysicsDrillPaper>;

// Client-safe question: no answer_numeric, no check spec.
export const StrippedPhysicsDrillQ = z.object({
  level: z.number().int().min(1).max(5),
  prompt_latex: z.string().min(1),
  hint: z.string(),
  tolerance: z.number().positive(),
  skill_tag: z.string().min(1),
});
export type StrippedPhysicsDrillQ = z.infer<typeof StrippedPhysicsDrillQ>;

export function stripPhysicsDrill(paper: PhysicsDrillPaper): { questions: StrippedPhysicsDrillQ[] } {
  return {
    questions: paper.questions.map((q) => ({
      level: q.level,
      prompt_latex: q.prompt_latex,
      hint: q.hint,
      tolerance: q.tolerance,
      skill_tag: q.skill_tag,
    })),
  };
}

export type PhysicsDrillSet = {
  skill_tag: string;
  questions: PhysicsBossBaseShape[];
};

export const PHYSICS_DRILL_MIN_COUNT = 5;
export const PHYSICS_DRILL_MAX_COUNT = 20;
export const PHYSICS_DRILL_DEFAULT_COUNT = 10;

export function clampPhysicsCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : PHYSICS_DRILL_DEFAULT_COUNT;
  return Math.min(PHYSICS_DRILL_MAX_COUNT, Math.max(PHYSICS_DRILL_MIN_COUNT, v));
}

// Round-robin interleave: level 1 of every skill, then level 2, and so on.
// Empty sets are skipped; each set is level-sorted first so the mix stays
// easy→hard even when cache order drifts.
export function interleavePhysicsDrills(sets: PhysicsDrillSet[], count: number): PhysicsDrillQuestion[] {
  const want = clampPhysicsCount(count);
  const sorted = sets.map((s) => ({
    skill_tag: s.skill_tag,
    questions: [...s.questions].sort((a, b) => a.level - b.level),
  }));
  const out: PhysicsDrillQuestion[] = [];
  const depth = Math.max(0, ...sorted.map((s) => s.questions.length));
  for (let i = 0; i < depth && out.length < want; i++) {
    for (const s of sorted) {
      if (out.length >= want) break;
      const q = s.questions[i];
      if (q) out.push({ ...q, skill_tag: s.skill_tag });
    }
  }
  return out;
}

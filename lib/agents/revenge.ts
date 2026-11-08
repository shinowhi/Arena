import { z } from "zod";
import { chatJson, MetaLLMError } from "../llm/meta";
import { BossOutput, type BossQuestion } from "./boss-generator";
import { isValidSkill, skillGradeLabel, skillName, skillSubject } from "../graph/skills";
import { verifyAnswer } from "../verify/math-verifier";

// Revenge Boss: a rematch forged from the player's own misses. The target is
// the skill with the most wrong answers; fresh questions must avoid every
// prompt the player already saw so the rematch never repeats the fight.

export const RevengeTarget = z.object({ skill_tag: z.string().min(1), wrong_count: z.number().int().positive() });
export type RevengeTarget = z.infer<typeof RevengeTarget>;

export type WrongVote = { skill_tag: string; created_at: string };

// Majority vote over wrong answers; ties break toward the most recent miss.
export function pickRevengeTarget(wrongs: WrongVote[]): RevengeTarget | null {
  const votes = wrongs.filter((w) => typeof w.skill_tag === "string" && w.skill_tag.length > 0);
  if (votes.length === 0) return null;
  const count = new Map<string, number>();
  const latest = new Map<string, string>();
  for (const w of votes) {
    count.set(w.skill_tag, (count.get(w.skill_tag) ?? 0) + 1);
    if ((latest.get(w.skill_tag) ?? "") < w.created_at) latest.set(w.skill_tag, w.created_at);
  }
  let best = "";
  let bestCount = -1;
  let bestAt = "";
  for (const [skill, n] of count) {
    const at = latest.get(skill) ?? "";
    if (n > bestCount || (n === bestCount && at > bestAt)) {
      best = skill;
      bestCount = n;
      bestAt = at;
    }
  }
  return { skill_tag: best, wrong_count: bestCount };
}

// Distinct recent prompts to forbid, newest bosses first. Capped so the
// avoid-list never eats the output window.
export function collectAvoidPrompts(
  bosses: Array<{ questions: Array<{ prompt_latex?: string }> }>,
  limit = 12,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of bosses) {
    for (const q of b.questions ?? []) {
      const p = (q.prompt_latex ?? "").slice(0, 300);
      if (p.length === 0 || seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const SYSTEM = `You write 5 isomorphic Calculus practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill. Every question MUST have a numeric answer a machine can recompute: definite integral, limit, derivative at a point, or direct numeric evaluation.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 1.234, "tolerance": 0.001, "hint": "...", "check": {...}}]}
- Exactly one question per level 1..5.
- prompt_latex: LaTeX problem statement shown to the student.
- check: machine spec proving answer_numeric, one of:
  {"kind": "numeric", "prompt_expr": "2*3+4"} (mathjs syntax; no integrals or derivatives inside)
  {"kind": "derivative_at", "expr": "x^3+2*x", "variable": "x", "at": 2}
  {"kind": "integral_at", "expr": "2*x", "variable": "x", "from": 0, "to": 3}
  {"kind": "limit_at", "expr": "sin(x)/x", "variable": "x", "at": 0}
- expr uses mathjs syntax: x^2, sin(x), exp(x), sqrt(x). Keep expressions smooth near the probe point except for genuine limit questions.
- tolerance 0.001 unless the answer scale demands otherwise.
- Plain ASCII words only outside math: write L'Hospital's rule with no accents or backslash escapes (never H\\^opital).
- REMATCH RULE: every question must differ in shape AND numbers from each AVOID prompt below. Never restate, renumber, or mirror one.`;

const MECHANICS_SYSTEM = `You write 5 isomorphic Mechanics of Materials practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill. Every question MUST reduce to ONE numeric computation a machine can recompute with plain arithmetic.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 80, "tolerance": 0.08, "hint": "...", "check": {...}}]}
- Exactly one question per level 1..5.
- prompt_latex: LaTeX problem statement shown to the student. State ALL given values with units (N, mm, MPa, GPa, kN, m) and name the wanted unit, e.g. "Give the axial stress in MPa."
- The wanted answer is ALWAYS a raw number (units live in the prompt only, never in answer_numeric).
- check: ALWAYS {"kind": "numeric", "prompt_expr": "<full mathjs expression>"} where prompt_expr computes the answer from the givens in ONE expression. Example: F = 12 kN on A = 150 mm^2, wanted stress in MPa -> prompt_expr "12000/150" (= 80, since 1 N/mm^2 = 1 MPa). Do ALL unit conversions inside prompt_expr with plain numbers (1 kN = 1000 N, 1 MPa = 1 N/mm^2, 1 GPa = 1000 MPa, use pi for 3.14159...).
- One formula per question: sigma=F/A, delta=F*L/(A*E), tau=T*r/J, phi=T*L/(G*J), sigma=M*y/I, tau=V*Q/(I*t), Pcr=pi^2*E*I/(K*L)^2, sigma=p*r/t, Mohr/transform trig. Multi-step stories are BANNED — bake intermediate values into the givens.
- Length-unit trap: NEVER mix mm and m in one expression. Convert everything to ONE unit first: 1 m = 1000 mm, 1 m^2 = 1e6 mm^2, 1 m^3 = 1e9 mm^3, 1 m^4 = 1e12 mm^4. State the chosen unit in the prompt (e.g. "Use E = 200000 MPa, L = 2400 mm").
- Tolerance: 0.1% of the answer magnitude, at least 0.001 (e.g. answer 80 -> tolerance 0.08).
- Plain ASCII words only outside math.
- REMATCH RULE: every question must differ in shape AND numbers from each AVOID prompt below. Never restate, renumber, or mirror one.`;

const K12_SYSTEM = `You write 5 isomorphic grade-school math practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill at the grade given in the user message. Every question MUST reduce to ONE numeric computation a machine can recompute with plain arithmetic: evaluate, solve for one unknown, count, or measure.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 42, "tolerance": 0.042, "hint": "...", "check": {...}}]}
- Exactly one question per level 1..5.
- prompt_latex: LaTeX problem statement shown to the student. State ALL given values; name the wanted quantity, e.g. "Give the larger root." or "Give the probability as a decimal."
- The wanted answer is ALWAYS a single raw number (units live in the prompt only, never in answer_numeric).
- check: ALWAYS {"kind": "numeric", "prompt_expr": "<full mathjs expression>"} where prompt_expr computes the answer from the givens in ONE expression. Example: solve 3x+5=20, wanted x -> prompt_expr "(20-5)/3". Use sqrt(), pi, ^, factorial() as needed; mathjs has no nCr — write combinations out (e.g. C(10,3) -> "10*9*8/(3*2*1)").
- One concept per question: never ask for two unknowns.
- Grade discipline: Grade 6-7 use small integers and simple fractions; Grade 8-9 allow radicals-as-decimals, systems, trig of special angles; Grade 10-12 allow vectors, combinatorics, probability, complex modulus, growth models. NEVER use calculus (no derivatives, integrals, or limits).
- Tolerance: 0.1% of the answer magnitude, at least 0.001. Exact integers get tolerance 0.001.
- Plain ASCII words only outside math.
- REMATCH RULE: every question must differ in shape AND numbers from each AVOID prompt below. Never restate, renumber, or mirror one.`;

export async function generateRevengeQuestions(skill_tag: string, avoid: string[]): Promise<BossQuestion[]> {
  if (!isValidSkill(skill_tag)) throw new MetaLLMError(`Invalid skill_tag: ${skill_tag}`);
  const subject = skillSubject(skill_tag);
  const system = subject === "mechanics" ? MECHANICS_SYSTEM : subject === "k12" ? K12_SYSTEM : SYSTEM;
  const gradeHint = subject === "k12" ? ` Grade: ${skillGradeLabel(skill_tag)}.` : "";
  const avoidBlock = avoid.length > 0 ? `\nAVOID (already seen, never repeat):\n${avoid.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "";
  let failed: BossQuestion[] = [];
  for (let round = 0; round < 3; round++) {
    const extra =
      failed.length > 0
        ? `\nThese drafts FAILED machine verification, return a fresh set of 5 with corrected variants: ${JSON.stringify(failed)}`
        : "";
    // 8k base like boss-generator: buckling-class mechanics prompts reason
    // long and truncate at the 4k default.
    const out = await chatJson(
      BossOutput,
      [
        { role: "system", content: system },
        { role: "user", content: `Skill: ${skill_tag} (${skillName(skill_tag)}).${gradeHint}${avoidBlock}${extra}` },
      ],
      { maxTokens: 8000 },
    );
    failed = out.questions.filter((q) => !verifyAnswer(q.check, q.answer_numeric, q.tolerance));
    if (failed.length === 0) return out.questions;
  }
  throw new MetaLLMError("Could not generate 5 verified revenge questions after 3 rounds.");
}

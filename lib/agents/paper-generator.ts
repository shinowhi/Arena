// Practice-paper generator: 10 verified questions (2 per level 1-5) for ONE
// skill. Same machine-verification discipline as bosses: every answer is
// recomputed with mathjs; unverifiable drafts are regenerated (max 3 rounds).
// Honesty note: stripPaper removes answer_numeric but ships the check spec,
// which trivially recomputes the answer (mechanics prompt_expr IS the
// computation). Acceptable for self-practice with local-only scores — but
// never feed paper scores into badges/leaderboards without server sessions.
import { z } from "zod";
import { chatJson, MetaLLMError } from "../llm/meta";
import { BossOutput, BossQuestion } from "./boss-generator";
import { isValidSkill, skillName, skillSubject } from "../graph/skills";
import { verifyAnswer } from "../verify/math-verifier";

export const PaperOutput = z.object({ questions: z.array(BossQuestion).length(10) });
export type PaperOutput = z.infer<typeof PaperOutput>;

export type PaperQuestion = Omit<z.infer<typeof BossQuestion>, "answer_numeric">;

export function stripPaper(paper: PaperOutput): { questions: PaperQuestion[] } {
  return {
    questions: paper.questions.map((q) => ({
      level: q.level,
      prompt_latex: q.prompt_latex,
      tolerance: q.tolerance,
      hint: q.hint,
      check: q.check,
    })),
  };
}

const SYSTEM = `You write 5 isomorphic Calculus practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill: exactly one question per level 1..5. Every question MUST have a numeric answer a machine can recompute: definite integral, limit, derivative at a point, or direct numeric evaluation.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 1.234, "tolerance": 0.001, "hint": "...", "check": {...}}]}
- prompt_latex: LaTeX problem statement shown to the student.
- check: machine spec proving answer_numeric, one of:
  {"kind": "numeric", "prompt_expr": "2*3+4"} (mathjs syntax; no integrals or derivatives inside)
  {"kind": "derivative_at", "expr": "x^3+2*x", "variable": "x", "at": 2}
  {"kind": "integral_at", "expr": "2*x", "variable": "x", "from": 0, "to": 3}
  {"kind": "limit_at", "expr": "sin(x)/x", "variable": "x", "at": 0}
- expr uses mathjs syntax: x^2, sin(x), exp(x), sqrt(x). Keep expressions smooth near the probe point except for genuine limit questions.
- tolerance 0.001 unless the answer scale demands otherwise.` + "\n- Plain ASCII words only outside math: write L'Hospital's rule with no accents or backslash escapes (never H\\^opital).";

const MECHANICS_SYSTEM = `You write 5 isomorphic Mechanics of Materials practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill: exactly one question per level 1..5. Every question MUST reduce to ONE numeric computation a machine can recompute with plain arithmetic.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 80, "tolerance": 0.08, "hint": "...", "check": {...}}]}
- prompt_latex: LaTeX problem statement shown to the student. State ALL given values with units (N, mm, MPa, GPa, kN, m) and name the wanted unit, e.g. "Give the axial stress in MPa."
- The wanted answer is ALWAYS a raw number (units live in the prompt only, never in answer_numeric).
- check: ALWAYS {"kind": "numeric", "prompt_expr": "<full mathjs expression>"} where prompt_expr computes the answer from the givens in ONE expression. Do ALL unit conversions inside prompt_expr with plain numbers (1 kN = 1000 N, 1 MPa = 1 N/mm^2, 1 GPa = 1000 MPa, use pi for 3.14159...).
- One formula per question: sigma=F/A, delta=F*L/(A*E), tau=T*r/J, phi=T*L/(G*J), sigma=M*y/I, tau=V*Q/(I*t), Pcr=pi^2*E*I/(K*L)^2, sigma=p*r/t, Mohr/transform trig. Multi-step stories are BANNED — bake intermediate values into the givens.
- Length-unit trap: NEVER mix mm and m in one expression. Convert everything to ONE unit first: 1 m = 1000 mm, 1 m^2 = 1e6 mm^2, 1 m^3 = 1e9 mm^3, 1 m^4 = 1e12 mm^4. State the chosen unit in the prompt (e.g. "Use E = 200000 MPa, L = 2400 mm").
- Tolerance: 0.1% of the answer magnitude, at least 0.001 (e.g. answer 80 -> tolerance 0.08).
- Plain ASCII words only outside math.`;

type Q = z.infer<typeof BossQuestion>;

// One 5-question set. A single 10-question call overflows the output window
// (schema failures), so papers are forged as 2 sequential sets; set B is told
// to use different numbers/givens from set A.
async function genSet(skill_tag: string, system: string, avoid: string): Promise<Q[]> {
  let failed: Q[] = [];
  for (let round = 0; round < 2; round++) {
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
        { role: "user", content: `Skill: ${skill_tag} (${skillName(skill_tag)}).${avoid}${extra}` },
      ],
      { maxTokens: 8000 },
    );
    failed = out.questions.filter((q) => !verifyAnswer(q.check, q.answer_numeric, q.tolerance));
    if (failed.length === 0) return out.questions;
  }
  throw new MetaLLMError("Could not generate 5 verified questions after 2 rounds.");
}

export async function generatePaper(skill_tag: string): Promise<PaperOutput> {
  if (!isValidSkill(skill_tag)) throw new MetaLLMError(`Invalid skill_tag: ${skill_tag}`);
  const system = skillSubject(skill_tag) === "mechanics" ? MECHANICS_SYSTEM : SYSTEM;
  const setA = await genSet(skill_tag, system, "");
  const avoid =
    `\nWrite a SECOND set of 5 with different numbers and givens from the first set (do not repeat them). Reply JSON only, no explanations. First set for reference: ${setA.map((q) => `L${q.level}:${q.prompt_latex.slice(0, 80)}`).join(" / ").slice(0, 900)}`;
  const setB = await genSet(skill_tag, system, avoid);
  const questions = [...setA, ...setB].sort((a, b) => a.level - b.level);
  return PaperOutput.parse({ questions });
}

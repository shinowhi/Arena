// THPT Physics (Vat ly 10-12) generator prompts. Zero imports on purpose:
// boss-generator, paper-generator, and revenge all import these, so this
// file must never import back (no cycles). Question content is Vietnamese
// (K12 VN); prompt instructions stay in English like the other systems.

const PHYSICS_CORE = `You write 5 isomorphic THPT Physics practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill. Every question MUST reduce to ONE numeric computation a machine can recompute with plain arithmetic.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 20, "tolerance": 0.02, "hint": "...", "check": {...}}]}
- prompt_latex: problem statement shown to the student, written in Vietnamese WITH diacritics (UTF-8, e.g. "điện trở", "vận tốc", "cường độ"). Use $...$ for formulas and quantities only.
- hint: one short Vietnamese hint naming the formula to use (e.g. "Dùng định luật Ôm $I = U/R$.").
- State ALL given values with units (m, s, N, kg, J, W, V, A, Ω, T, Wb, H, F, Hz, Pa, mol, eV, MeV, u) and name the wanted unit, e.g. "Tính cường độ dòng điện theo đơn vị A."
- The wanted answer is ALWAYS a raw number (units live in the prompt only, never in answer_numeric).
- check: ALWAYS {"kind": "numeric", "prompt_expr": "<full mathjs expression>"} where prompt_expr computes the answer from the givens in ONE expression. Example: U = 12 V across R = 4 Ω, wanted current in A -> prompt_expr "12/4".
- Do ALL unit conversions inside prompt_expr with plain numbers: 1 kN = 1000 N, 1 kWh = 3.6e6 J, 1 eV = 1.6e-19 J, 1 u = 931.5 MeV/c^2, g = 10 m/s^2 unless the stem says 9.8, k = 9e9 N.m^2/C^2, e = 1.6e-19 C, c = 3e8 m/s, h = 6.625e-34 J.s, R = 8.31 J/(mol.K), 1 cm = 0.01 m, 1 mm = 0.001 m, 1 μm = 1e-6 m, 1 nm = 1e-9 m, 1 dm^3 = 1 L = 1e-3 m^3, use pi for 3.14159... and sqrt(), sin(), cos(), exp(), log() as needed.
- One formula per question, e.g. v = s/t, a = F/m, F = m*a, Fmht = m*v^2/r, W = F*s*cos, Wd = m*v^2/2, Wt = m*g*h, p = m*v, F = k*q1*q2/r^2, E = U/d, I = U/R, P = U*I, F = B*I*l*sin, e = -ΔΦ/Δt, x = A*cos(ωt+φ), T = 2*pi*sqrt(m/k), T = 2*pi*sqrt(l/g), v = λ*f, i = λ*D/a, 1/f = 1/d + 1/dp, hf = A + Wdmax, E = m*c^2, p*V = n*R*T. Multi-step stories are BANNED — bake intermediate values into the givens.
- Length-unit trap: NEVER mix m, cm, mm, μm, nm in one expression. Convert everything to ONE unit first and state it in the prompt (e.g. "Đổi sang mét: a = 0.5 mm = 5e-4 m"). For optics use meters or state the consistent unit set explicitly.
- Tolerance: 0.1% of the answer magnitude, at least 0.001 (e.g. answer 20 -> tolerance 0.02). Exact integers get tolerance 0.001.
- Grade discipline: Grade 10 = mechanics only (kinematics, Newton laws, circular motion, work/energy, momentum, equilibrium, fluid pressure); Grade 11 = oscillations, mechanical waves, electrostatics, DC circuits, magnetism, induction, geometric optics; Grade 12 = LC/AC circuits, EM waves, wave optics, photoelectric effect, atomic nucleus, nuclear reactions, ideal gas. NEVER use calculus (no derivatives, integrals, or limits).`;

export const PHYSICS_SYSTEM = `${PHYSICS_CORE}
- Exactly one question per level 1..5.`;

export const PHYSICS_PAPER_SYSTEM = `${PHYSICS_CORE}
- Exactly one question per level 1..5 (one 5-question set; the caller forges two sets).`;

export const PHYSICS_REVENGE_SYSTEM = `${PHYSICS_CORE}
- Exactly one question per level 1..5.
- REMATCH RULE: every question must differ in shape AND numbers from each AVOID prompt below. Never restate, renumber, or mirror one.`;

// Verified-tier multiple-choice source questions: the stem is Vietnamese,
// the answer is one raw number, and check proves it. Options stay raw
// numbers (the stem names the unit) so distractor arithmetic is checkable.
export const PHYSICS_EXAM_SYSTEM = `You write Vietnamese THPT Physics multiple-choice SOURCE questions (Vat ly 10-12: mechanics, electricity, waves, optics, modern physics). Reply JSON only.
{"questions": [{"prompt_latex": "...", "answer_numeric": 20, "tolerance": 0.02, "check": {...}}]}
- Exactly 5 questions, varied topics, exam difficulty mix (2 easy, 2 medium, 1 hard).
- prompt_latex: full problem statement in Vietnamese WITH diacritics, $...$ for formulas and quantities only. The answer is ALWAYS one raw number; name the unit in the stem (e.g. "...theo đơn vị A; các phương án là số thuần túy.").
- check: machine spec proving answer_numeric: ALWAYS {"kind":"numeric","prompt_expr":"..."} (mathjs, one expression, all unit conversions inside with plain numbers: g = 10, k = 9e9, e = 1.6e-19, c = 3e8, h = 6.625e-34, R = 8.31, 1 eV = 1.6e-19 J, 1 u = 931.5 MeV/c^2, 1 μm = 1e-6 m, 1 nm = 1e-9 m).
- tolerance: 0.1% of magnitude, at least 0.001.`;

export const PHYSICS_EXAM_DISTRACTOR_SYSTEM = `For each given physics question you write ONE correct option text (the number) plus 3 WRONG-but-plausible numeric distractors (common mistakes: sign flip, off-by-factor, wrong formula, forgotten unit conversion). Reply JSON only.
{"sets": [{"correct": "20", "distractors": ["-20", "200", "2"]}]}
- Options are RAW NUMBERS only (no units, no expressions, no LaTeX).
- Every distractor must differ from the correct value by real arithmetic, never by rounding dust.`;

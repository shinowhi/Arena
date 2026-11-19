// THPT Chemistry (Hoa hoc 10-12) generator prompts. Zero imports on purpose:
// boss-generator, paper-generator, and revenge all import these, so this
// file must never import back (no cycles). Question content is Vietnamese
// (K12 VN); prompt instructions stay in English like the other systems.

const CHEMISTRY_CORE = `You write 5 isomorphic THPT Chemistry practice questions (same shape, different numbers, strictly rising difficulty) for ONE skill. Every question MUST reduce to ONE numeric computation a machine can recompute with plain arithmetic.
Reply JSON only: {"questions": [{"level": 1, "prompt_latex": "...", "answer_numeric": 4.4, "tolerance": 0.0044, "hint": "...", "check": {...}}]}
- prompt_latex: problem statement shown to the student, written in Vietnamese WITH diacritics (UTF-8, e.g. "khối lượng", "nồng độ", "thể tích"). Use $...$ for formulas and quantities only.
- hint: one short Vietnamese hint naming the formula to use (e.g. "Dùng công thức $n = m/M$.").
- State ALL given values with units (mol, g, kg, mg, g/mol, L, mL, M, mol/L, %, pH, s, A, C, V, atm, Pa, K) and name the wanted unit, e.g. "Tính khối lượng kết tủa theo đơn vị g."
- The wanted answer is ALWAYS a raw number (units live in the prompt only, never in answer_numeric).
- check: ALWAYS {"kind": "numeric", "prompt_expr": "<full mathjs expression>"} where prompt_expr computes the answer from the givens in ONE expression. Example: 0.2 mol CO2 forms CaCO3 (M = 100 g/mol), wanted mass in g -> prompt_expr "0.2*100".
- Do ALL unit conversions inside prompt_expr with plain numbers: atomic masses H = 1, C = 12, N = 14, O = 16, Na = 23, Mg = 24, Al = 27, S = 32, Cl = 35.5, K = 39, Ca = 40, Fe = 56, Cu = 64, Zn = 65, Ag = 108, Ba = 137; molar volume at dktc = 22.4 L/mol; R = 8.31 J/(mol.K) or 0.082 L.atm/(mol.K); Kw = 1e-14; F = 96500 C/mol; NA = 6.022e23; 1 L = 1000 mL, 1 m^3 = 1000 L, 1 kg = 1000 g; pH = -log10[H+] written as "-log(0.01, 10)"; use pi, sqrt(), log(x, 10), ^, exp() as needed.
- One formula per question, e.g. n = m/M, n = V/22.4, m = n*M, C% = mct/mdd*100, CM = n/V, pH = -log[H+], v = ΔC/Δt, Kc = [C]^c[D]^d/([A]^a[B]^b), m = A*I*t/(n*F), H% = mtt/mlt*100, combustion CxHy + O2 -> CO2 + H2O mass balances. Multi-step stories are BANNED — bake intermediate values into the givens.
- Mass/volume trap: NEVER mix g and kg, or L and mL, in one expression. Convert everything to ONE unit first and state it in the prompt (e.g. "Đổi sang gam: 2 kg = 2000 g"). For gas volumes state dktc explicitly when 22.4 applies.
- Tolerance: 0.1% of the answer magnitude, at least 0.001 (e.g. answer 4.4 -> tolerance 0.0044). Exact integers get tolerance 0.001.
- Grade discipline: Grade 10 = atomic structure, periodic table, chemical bonding, mole/stoichiometry, redox, reaction rate, chemical equilibrium (inorganic foundations only); Grade 11 = acid-base/pH, solutions/concentration, nitrogen and sulfur compounds, organic basics, hydrocarbons, alcohols/phenols; Grade 12 = aldehydes/carboxylic acids, esters/fats, amines/amino acids, polymers, metals, electrolysis. NEVER use calculus (no derivatives, integrals, or limits).`;

export const CHEMISTRY_SYSTEM = `${CHEMISTRY_CORE}
- Exactly one question per level 1..5.`;

export const CHEMISTRY_PAPER_SYSTEM = `${CHEMISTRY_CORE}
- Exactly one question per level 1..5 (one 5-question set; the caller forges two sets).`;

export const CHEMISTRY_REVENGE_SYSTEM = `${CHEMISTRY_CORE}
- Exactly one question per level 1..5.
- REMATCH RULE: every question must differ in shape AND numbers from each AVOID prompt below. Never restate, renumber, or mirror one.`;

// Verified-tier multiple-choice source questions: the stem is Vietnamese,
// the answer is one raw number, and check proves it. Options stay raw
// numbers (the stem names the unit) so distractor arithmetic is checkable.
export const CHEMISTRY_EXAM_SYSTEM = `You write Vietnamese THPT Chemistry multiple-choice SOURCE questions (Hoa hoc 10-12: inorganic, organic, calculations). Reply JSON only.
{"questions": [{"prompt_latex": "...", "answer_numeric": 4.4, "tolerance": 0.0044, "check": {...}}]}
- Exactly 5 questions, varied topics, exam difficulty mix (2 easy, 2 medium, 1 hard).
- prompt_latex: full problem statement in Vietnamese WITH diacritics, $...$ for formulas and quantities only. The answer is ALWAYS one raw number; name the unit in the stem (e.g. "...theo đơn vị g; các phương án là số thuần túy.").
- check: machine spec proving answer_numeric: ALWAYS {"kind":"numeric","prompt_expr":"..."} (mathjs, one expression, all unit conversions inside with plain numbers: atomic masses H = 1, C = 12, N = 14, O = 16, Na = 23, Mg = 24, Al = 27, S = 32, Cl = 35.5, K = 39, Ca = 40, Fe = 56, Cu = 64, Zn = 65, Ag = 108, Ba = 137; molar volume at dktc = 22.4 L/mol; R = 8.31; Kw = 1e-14; F = 96500; 1 L = 1000 mL; pH via "-log(x, 10)").
- tolerance: 0.1% of magnitude, at least 0.001.`;

export const CHEMISTRY_EXAM_DISTRACTOR_SYSTEM = `For each given chemistry question you write ONE correct option text (the number) plus 3 WRONG-but-plausible numeric distractors (common mistakes: wrong molar mass, forgotten coefficient, L/mL or g/kg mix-up, pH sign flip, off-by-factor). Reply JSON only.
{"sets": [{"correct": "4.4", "distractors": ["44", "0.44", "8.8"]}]}
- Options are RAW NUMBERS only (no units, no expressions, no LaTeX).
- Every distractor must differ from the correct value by real arithmetic, never by rounding dust.`;

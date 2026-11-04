// Cached diagnoses for the 2 built-in scan samples (B1 hero path).
// Items / weak_skill / root_cause / confidence are verbatim production LLM
// output; only can_summon is lifted so the labeled demo loop can summon.
// Byte-hash matching is impossible here: the client downscales uploads to
// JPEG before POST, so the server keys on the explicit sample id instead.
export type SampleDiagnosis = {
  items: Array<{ cau_hoi: string; dap_an_sinh_vien: string; skill_tag: string[] }>;
  weak_skill: string;
  root_cause: string;
  confidence: number;
  can_summon: boolean;
};

export const SAMPLE_IDS = ["area-integral","implicit-diff"] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

const SAMPLE_DIAGNOSES: Record<string, SampleDiagnosis> = {
  "area-integral": {
    "items": [
      {
        "cau_hoi": "Find the area $S$ of a circle of radius $r$ with upper boundary $y = \\sqrt{r^2 - x^2}$, where $S_1$ denotes the upper half-disk area and $S_2$ denotes the lower half-disk area.",
        "dap_an_sinh_vien": "$S_1 = \\int_{-r}^{r} \\sqrt{r^2 - x^2} dx$, $S_2 = S_1$, $S = 2S_1 = 2\\int_{-r}^{r} \\sqrt{r^2 - x^2} dx$",
        "skill_tag": [
          "area_between_curves",
          "definite_integrals"
        ]
      }
    ],
    "weak_skill": "area_between_curves",
    "root_cause": "area_between_curves",
    "confidence": 0.15,
    "can_summon": true
  },
  "implicit-diff": {
    "items": [
      {
        "cau_hoi": "8. $\\sqrt{x} + \\sqrt{y} = 1$",
        "dap_an_sinh_vien": "=> $\\frac{1}{2\\sqrt{x}} + \\frac{1}{2\\sqrt{y}}y' = 0$ => $y' = -\\frac{\\sqrt{y}}{\\sqrt{x}}$",
        "skill_tag": [
          "implicit_differentiation"
        ]
      },
      {
        "cau_hoi": "4. $\\frac{2}{x} - \\frac{1}{y} = 4$",
        "dap_an_sinh_vien": "=> $-\\frac{2}{x^2} + \\frac{1}{y^2}y' = 0$ => $y' = \\frac{2y^2}{x^2}$",
        "skill_tag": [
          "implicit_differentiation"
        ]
      },
      {
        "cau_hoi": "9. $\\frac{x^2}{x+y} = y^2 + 1$",
        "dap_an_sinh_vien": "=> $\\frac{(2x)(x+y)-x^2(1+y')}{(x+y)^2} = 2yy'$ => $x^2+2xy - x^2y' = 2yy'(x+y)^2$ => $y' = \\frac{x^2+2xy}{x^2+2y(x+y)^2}$",
        "skill_tag": [
          "implicit_differentiation"
        ]
      },
      {
        "cau_hoi": "10. $y^5 + x^2y^3 = 1 + x^4y$",
        "dap_an_sinh_vien": "=> $5y^4y' + 2xy^3 + x^2 3y^2y' = 4x^3y + x^4y'$ => $y' = \\frac{4x^3y-2xy^3}{5y^4+3x^2y^2-x^4}$",
        "skill_tag": [
          "implicit_differentiation"
        ]
      },
      {
        "cau_hoi": "11. $y\\cos x = x^2 + y^2$",
        "dap_an_sinh_vien": "=> $y'\\cos x - y\\sin x = 2x + 2yy'$ => $y' = \\frac{2x + y\\sin x}{\\cos x - 2y}$",
        "skill_tag": [
          "implicit_differentiation"
        ]
      },
      {
        "cau_hoi": "12. $\\cos(xy) = 1 + \\sin y$",
        "dap_an_sinh_vien": "=> $-\\sin(xy)(y + xy') = y'\\cos y$ => $y' = \\frac{-y\\sin(xy)}{\\cos y + x\\sin(xy)}$",
        "skill_tag": [
          "implicit_differentiation"
        ]
      }
    ],
    "weak_skill": "implicit_differentiation",
    "root_cause": "implicit_differentiation",
    "confidence": 0.15,
    "can_summon": true
  }
};

export function sampleDiagnosis(id: string): (SampleDiagnosis & { sample: true }) | null {
  const d = SAMPLE_DIAGNOSES[id];
  return d ? { ...d, sample: true } : null;
}

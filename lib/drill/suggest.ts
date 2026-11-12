import { skillName } from "@/lib/graph/skills";

// Rule-based next-step suggestions for a finished drill set. Pure, NO LLM:
// the submit route calls this after grading. Every href is a REAL route
// (verified against the app dir): /drill, /drill/[id], /revenge, /arena,
// /paper?skill=&exam=1, /adaptive. Never invent routes here.

export type SuggestionType = "easier" | "revenge" | "boss" | "harder" | "adaptive" | "retry";

export type Suggestion = {
  type: SuggestionType;
  label: string;
  href: string;
  skill?: string;
};

export type PerSkill = Record<string, { right: number; total: number }>;

export type SuggestInput = {
  scorePct: number;
  perSkill: PerSkill;
  source: "weak" | "misses" | "topic" | "upload";
  setId: string;
};

export function suggestNext({ scorePct, perSkill, source, setId }: SuggestInput): Suggestion[] {
  const tags = Object.keys(perSkill);
  const zeroSkill =
    tags.find((t) => (perSkill[t]?.total ?? 0) > 0 && (perSkill[t]?.right ?? 0) === 0) ?? null;
  let weakest: string | null = null;
  let weakestAcc = 2;
  for (const t of tags) {
    const s = perSkill[t];
    if (!s || s.total <= 0) continue;
    const acc = s.right / s.total;
    if (acc < weakestAcc) {
      weakestAcc = acc;
      weakest = t;
    }
  }
  let primary: Suggestion;
  if (scorePct < 50) {
    primary = {
      type: "easier",
      label: "Score is low — start a fresh drill to rebuild",
      href: "/drill",
    };
  } else if (zeroSkill) {
    primary = {
      type: "revenge",
      skill: zeroSkill,
      label: `Take revenge on ${skillName(zeroSkill)}`,
      href: "/revenge",
    };
  } else if (source === "misses" && scorePct >= 80) {
    primary = {
      type: "boss",
      label: "Miss queue cleared — challenge the boss in the arena",
      href: "/arena",
      ...(weakest ? { skill: weakest } : {}),
    };
  } else if (scorePct >= 80 && weakest) {
    primary = {
      type: "harder",
      skill: weakest,
      label: `Push harder: timed exam on ${skillName(weakest)}`,
      href: `/paper?skill=${encodeURIComponent(weakest)}&exam=1`,
    };
  } else if (scorePct >= 80) {
    primary = {
      type: "harder",
      label: "Push harder with a new drill",
      href: "/drill",
    };
  } else {
    primary = {
      type: "adaptive",
      label: "Continue with adaptive practice",
      href: "/adaptive",
    };
  }
  return [primary, { type: "retry", label: "Retry this drill set", href: `/drill/${setId}` }];
}

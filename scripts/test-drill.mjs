// Offline tests: drill-hub contracts (suggest, strip, validation, clamp).
// Run: node arena/scripts/test-drill.mjs
// Note: mirrors lib/drill/paper.ts + lib/drill/suggest.ts + the create-route
// Body schema (same convention as test-paper.mjs / test-misses.mjs).
import assert from "node:assert/strict";
import { z } from "zod";

// ---- Mirrors of lib/drill/paper.ts ----
const DRILL_MIN_COUNT = 5;
const DRILL_MAX_COUNT = 20;
const DRILL_DEFAULT_COUNT = 10;
function clampCount(n) {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DRILL_DEFAULT_COUNT;
  return Math.min(DRILL_MAX_COUNT, Math.max(DRILL_MIN_COUNT, v));
}
function stripDrillPaper(paper) {
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

// ---- Mirror of the create-route Body schema + field rules ----
const Body = z.object({
  source: z.enum(["weak", "misses", "topic", "upload"]),
  topic: z.string().min(1).optional(),
  image: z.string().min(1).optional(),
  count: z.number().int().optional(),
});
const VALID_SKILLS = new Set(["axial_loading", "limit_laws"]);
function createValid(body) {
  const parsed = Body.safeParse(body);
  if (!parsed.success) return false;
  const { source, topic, image } = parsed.data;
  if (source === "topic" && (!topic || !VALID_SKILLS.has(topic))) return false;
  if (source === "upload" && (!image || !image.startsWith("data:image/") || image.length > 7000000))
    return false;
  return true;
}

// ---- Mirror of lib/drill/suggest.ts (skillName falls back to the id) ----
function suggestNext({ scorePct, perSkill, source, setId }) {
  const tags = Object.keys(perSkill);
  const zeroSkill = tags.find((t) => (perSkill[t]?.total ?? 0) > 0 && (perSkill[t]?.right ?? 0) === 0) ?? null;
  let weakest = null;
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
  let primary;
  if (scorePct < 50) {
    primary = { type: "easier", label: "Score is low — start a fresh drill to rebuild", href: "/drill" };
  } else if (zeroSkill) {
    primary = { type: "revenge", skill: zeroSkill, label: `Take revenge on ${zeroSkill}`, href: "/revenge" };
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
      label: `Push harder: timed exam on ${weakest}`,
      href: `/paper?skill=${encodeURIComponent(weakest)}&exam=1`,
    };
  } else if (scorePct >= 80) {
    primary = { type: "harder", label: "Push harder with a new drill", href: "/drill" };
  } else {
    primary = { type: "adaptive", label: "Continue with adaptive practice", href: "/adaptive" };
  }
  return [primary, { type: "retry", label: "Retry this drill set", href: `/drill/${setId}` }];
}

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// Count clamp.
ok(clampCount(undefined) === 10, "count defaults to 10");
ok(clampCount(3) === 5, "count clamps up to 5");
ok(clampCount(99) === 20, "count clamps down to 20");
ok(clampCount(7.9) === 7, "count floors decimals");
ok(clampCount(NaN) === 10 && clampCount("x") === 10, "garbage count means default");

// Create-body validation.
ok(createValid({ source: "weak" }), "weak parses");
ok(createValid({ source: "topic", topic: "axial_loading", count: 15 }), "topic+skill parses");
ok(!createValid({ source: "boss" }), "bad source rejected");
ok(!createValid({ source: "topic" }), "topic without skill rejected");
ok(!createValid({ source: "topic", topic: "nope_not_a_skill" }), "unknown skill rejected");
ok(!createValid({ source: "upload" }), "upload without image rejected");
ok(!createValid({ source: "upload", image: "https://x/y.png" }), "non-data-URL image rejected");
ok(createValid({ source: "upload", image: "data:image/png;base64,AAA" }), "data URL image parses");

// Suggestion branches (all five primary types + retry).
const per = (rights, totals) => ({ axial_loading: { right: rights, total: totals } });
let s = suggestNext({ scorePct: 30, perSkill: per(3, 10), source: "weak", setId: "s1" });
ok(s[0].type === "easier" && s[0].href === "/drill", "low score suggests easier drill");
s = suggestNext({
  scorePct: 75,
  perSkill: { axial_loading: { right: 6, total: 8 }, limit_laws: { right: 0, total: 2 } },
  source: "topic",
  setId: "s2",
});
ok(s[0].type === "revenge" && s[0].href === "/revenge" && s[0].skill === "limit_laws", "shutout skill suggests revenge");
s = suggestNext({ scorePct: 90, perSkill: per(9, 10), source: "misses", setId: "s3" });
ok(s[0].type === "boss" && s[0].href === "/arena", "cleared misses suggest boss fight");
s = suggestNext({ scorePct: 90, perSkill: per(9, 10), source: "topic", setId: "s4" });
ok(s[0].type === "harder" && s[0].href.startsWith("/paper?skill=") && s[0].href.endsWith("&exam=1"), "high score suggests harder exam");
s = suggestNext({ scorePct: 60, perSkill: per(6, 10), source: "weak", setId: "s5" });
ok(s[0].type === "adaptive" && s[0].href === "/adaptive", "mid score suggests adaptive");
ok(s[1].type === "retry" && s[1].href === "/drill/s5", "retry links back to the set");
s = suggestNext({ scorePct: 20, perSkill: { limit_laws: { right: 0, total: 5 } }, source: "misses", setId: "s6" });
ok(s[0].type === "easier", "easier outranks revenge when the whole set is weak");
for (const one of s) {
  ok(
    ["easier", "revenge", "boss", "harder", "adaptive", "retry"].includes(one.type) &&
      /^\/(drill(\/|$|(\?|$))|revenge|arena|paper\?|adaptive)/.test(one.href),
    `suggestion href is a real route (${one.href})`,
  );
}

// Paper strip: keys never reach the client shape.
const mkQ = (i) => ({
  level: (i % 5) + 1,
  prompt_latex: `Q${i}`,
  answer_numeric: 42 + i,
  tolerance: 0.042,
  hint: "h",
  check: { kind: "numeric", prompt_expr: `${42 + i}` },
  skill_tag: "axial_loading",
});
const stripped = stripDrillPaper({ questions: [mkQ(0), mkQ(1)] });
ok(stripped.questions.length === 2, "strip keeps every question");
for (const q of stripped.questions) {
  ok(!("answer_numeric" in q) && !("check" in q), "no keys or check specs leak");
  ok(q.prompt_latex.length > 0 && q.skill_tag === "axial_loading", "prompt and skill survive strip");
}
ok(JSON.stringify(stripped).indexOf("answer_numeric") === -1, "serialized set has no answers");

// Submit-body shape: blanks arrive as null, never as NaN/zero.
const SubmitBody = z.object({ answers: z.array(z.union([z.number().finite(), z.null()])).max(25) });
ok(SubmitBody.safeParse({ answers: [1.5, null, 6] }).success, "null blanks parse");
ok(!SubmitBody.safeParse({ answers: [NaN] }).success, "NaN answers rejected");
ok(!SubmitBody.safeParse({ answers: "6" }).success, "non-array answers rejected");

console.log(`DRILL TESTS OK: ${n} assertions`);

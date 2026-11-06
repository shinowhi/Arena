// Offline tests: study-plan contract. No network.
// Run: node arena/scripts/test-plan.mjs
import assert from "node:assert/strict";
import { z } from "zod";

const PlanDay = z.object({
  day: z.number().int().min(1).max(7),
  focus_skill: z.string().min(1),
  tasks: z.array(z.string().min(1)).min(1).max(4),
  minutes: z.number().int().min(5).max(120),
});
const PlanOutput = z.object({ days: z.array(PlanDay).length(7) });

const mkDay = (day) => ({ day, focus_skill: "chain_rule", tasks: ["Drill the basics"], minutes: 25 });
const full = { days: [1, 2, 3, 4, 5, 6, 7].map(mkDay) };

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

ok(PlanOutput.safeParse(full).success, "7-day plan parses");
ok(!PlanOutput.safeParse({ days: full.days.slice(0, 6) }).success, "6 days rejected");
ok(!PlanOutput.safeParse({ days: full.days.map((d) => ({ ...d, tasks: [] })) }).success, "empty tasks rejected");
ok(!PlanOutput.safeParse({ days: full.days.map((d) => ({ ...d, minutes: 3 })) }).success, "tiny minutes rejected");
ok(!PlanOutput.safeParse({ days: full.days.map((d) => ({ ...d, focus_skill: "" })) }).success, "empty skill rejected");

// Repair rule mirror: invalid focus falls back to the most frequent weak.
function repairFocus(days, history) {
  const freq = new Map();
  for (const h of history) freq.set(h, (freq.get(h) ?? 0) + 1);
  const fallback = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return days.map((d) => (d === "bad_skill" ? fallback : d));
}
ok(
  JSON.stringify(repairFocus(["bad_skill", "chain_rule"], ["limit_laws", "limit_laws", "chain_rule"])) ===
    JSON.stringify(["limit_laws", "chain_rule"]),
  "fallback is most frequent weak",
);

console.log(`PLAN TESTS OK: ${n} assertions`);

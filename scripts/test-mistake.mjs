// Offline tests: mistake-tutor leak guard + contract. No network.
// Run: node arena/scripts/test-mistake.mjs
// Note: mirrors containsAnswer in lib/agents/mistake-tutor.ts.
import assert from "node:assert/strict";
import { z } from "zod";

// Mirror of containsAnswer in lib/agents/mistake-tutor.ts.
function containsAnswer(text, answer, tolerance) {
  if (typeof text !== "string" || !Number.isFinite(answer)) return false;
  const tol = Math.max(tolerance, 1e-9);
  const tokens = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return tokens.some((t) => Math.abs(Number(t) - answer) <= tol);
}

const NudgeOut = z.object({ nudge: z.string().min(1).max(800) });

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

ok(containsAnswer("The answer is 80.", 80, 0.08) === true, "exact leak caught");
ok(containsAnswer("You wrote 80.0 but check signs.", 80, 0.08) === true, "decimal form caught");
ok(containsAnswer("Close: 80.05 vs yours.", 80, 0.08) === true, "within tolerance caught");
ok(containsAnswer("Recheck signs and arithmetic.", 80, 0.08) === false, "clean nudge passes");
ok(containsAnswer("Off by a factor of 2, see step 3.", 80, 0.08) === false, "small numbers pass");
ok(containsAnswer("180 is too high.", 80, 0.08) === false, "80 inside 180 is not a leak");
ok(containsAnswer("Answer -1.234 exactly.", -1.234, 0.001) === true, "negative float caught");
ok(containsAnswer(null, 80, 0.08) === false, "non-string safe");
ok(containsAnswer("80", NaN, 0.08) === false, "non-finite answer safe");

ok(NudgeOut.safeParse({ nudge: "Check your signs." }).success, "nudge parses");
ok(!NudgeOut.safeParse({ nudge: "" }).success, "empty nudge rejected");
ok(!NudgeOut.safeParse({ nudge: "x".repeat(801) }).success, "long nudge rejected");

console.log(`MISTAKE TESTS OK: ${n} assertions`);

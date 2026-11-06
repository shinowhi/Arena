// Offline tests: boss-taunt contract. No network.
// Run: node arena/scripts/test-taunt.mjs
import assert from "node:assert/strict";
import { z } from "zod";

const TauntOutput = z.object({ taunt: z.string().min(1).max(140) });
const Moods = ["greet", "wounded", "slain"];

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

ok(TauntOutput.safeParse({ taunt: "You call that a derivative? Pathetic." }).success, "taunt parses");
ok(!TauntOutput.safeParse({ taunt: "" }).success, "empty taunt rejected");
ok(!TauntOutput.safeParse({ taunt: "x".repeat(141) }).success, "overlong taunt rejected");
ok(!TauntOutput.safeParse({}).success, "missing taunt rejected");
for (const m of Moods) ok(typeof m === "string" && m.length > 0, `mood ${m} known`);
ok(Moods.length === 3, "exactly 3 moods");

console.log(`TAUNT TESTS OK: ${n} assertions`);

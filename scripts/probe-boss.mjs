// Live probe: generate one boss set for a skill and verify. Needs network + key.
// Run from arena/: npx -y tsx scripts/probe-boss.mjs integration_by_parts
import { readFileSync, existsSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['" \s]/, "").replace(/['" \s]$/, "");
    }
  }
}
const { generateBossQuestions } = await import("../lib/agents/boss-generator.ts");
const { verifyAnswer } = await import("../lib/verify/math-verifier.ts");
const skill = process.argv[2] ?? "integration_by_parts";
const boss = await generateBossQuestions(skill);
let bad = 0;
for (const qq of boss.questions) {
  const good = verifyAnswer(qq.check, qq.answer_numeric, qq.tolerance);
  if (!good) bad++;
  console.log("L" + qq.level + " " + (good ? "OK" : "FAIL") + " ans=" + qq.answer_numeric + " :: " + qq.prompt_latex.slice(0, 90));
}
console.log(bad === 0 ? "PROBE OK: 5/5 verified" : "PROBE FAIL: " + bad + " unverified");
process.exit(bad === 0 ? 0 : 1);





// Live probe: run Agent 1 + Agent 2 over images in fixtures/. Needs network + key.
// Run from arena/: npx -y tsx scripts/probe-scan.mjs [limit]
import { readFileSync, existsSync, readdirSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['" \s]/, "").replace(/['" \s]$/, "");
    }
  }
}
const { decomposeImage } = await import("../lib/agents/vision-decomposer.ts");
const { findGap } = await import("../lib/agents/gap-finder.ts");
const limit = Number(process.argv[2]) || 0;
const all = readdirSync("fixtures").filter((f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg"));
const files = limit > 0 ? all.slice(0, limit) : all;
if (files.length === 0) {
  console.log("No images in fixtures/");
  process.exit(1);
}
for (const f of files) {
  try {
    const b64 = readFileSync("fixtures/" + f).toString("base64");
    const ext = f.endsWith(".png") ? "png" : "jpeg";
    const decomp = await decomposeImage("data:image/" + ext + ";base64," + b64);
    const gap = await findGap(decomp);
    console.log(f + " => weak=" + gap.weak_skill + " root=" + gap.root_cause + " conf=" + gap.confidence.toFixed(2));
  } catch (e) {
    console.log(f + " => ERROR: " + (e instanceof Error ? e.message : e));
  }
}

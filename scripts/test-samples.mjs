// Offline tests: B1 sample-diagnosis fixtures. No network.
// Run: node scripts/test-samples.mjs (from the arena/ directory)
// Note: reads lib/scan/samples.ts as text (like test-social.mjs mirrors
// rules.ts) so it runs on plain node without a TS loader.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../lib/scan/samples.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/scan/route.ts", import.meta.url), "utf8");

let n = 0;
const ok = (cond, msg) => {
  n += 1;
  assert.ok(cond, msg);
};

// String-aware brace match: LaTeX bodies contain {} inside strings.
function extractObject(text, marker) {
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  const open = text.indexOf("{", start);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

const map = JSON.parse(extractObject(src, "SAMPLE_DIAGNOSES"));
ok(Object.keys(map).length === 2, "exactly 2 samples");
for (const id of ["area-integral", "implicit-diff"]) {
  const d = map[id];
  ok(d && typeof d === "object", `${id} present`);
  ok(Array.isArray(d.items) && d.items.length > 0, `${id} items non-empty`);
  ok(typeof d.items[0].cau_hoi === "string" && d.items[0].cau_hoi.length > 10, `${id} cau_hoi real`);
  ok(
    Array.isArray(d.items[0].skill_tag) && d.items[0].skill_tag.length > 0,
    `${id} skill_tag non-empty`,
  );
  ok(typeof d.weak_skill === "string" && d.weak_skill.length > 0, `${id} weak_skill`);
  ok(typeof d.root_cause === "string" && d.root_cause.length > 0, `${id} root_cause`);
  ok(typeof d.confidence === "number" && d.confidence >= 0 && d.confidence <= 1, `${id} confidence range`);
  ok(d.can_summon === true, `${id} summon lifted for demo loop`);
}
ok(src.includes('"area-integral"') && src.includes('"implicit-diff"'), "SAMPLE_IDS lists both");
ok(src.includes("export function sampleDiagnosis"), "sampleDiagnosis exported");
ok(src.includes("sample: true"), "helper labels hits as sample");
ok(route.includes('form.get("sample")'), "route reads sample field");
ok(route.includes("sampleDiagnosis(sampleId)"), "route serves cached hit");

console.log(`SAMPLE TESTS OK: ${n} assertions`);

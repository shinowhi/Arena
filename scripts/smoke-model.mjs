// One-shot M0 smoke test: sends the synthetic fixture image to the Meta model, expects JSON.
// Run from arena/ in a terminal WITH network: node scripts/smoke-model.mjs
import { readFileSync, existsSync } from "node:fs";

function loadEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      if (!process.env[m[1]]) {
        const v = m[2].replace(/^['"]/, "").replace(/['"]$/, "");
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(".env.local");

const baseUrl = (process.env.META_MODEL_API_BASE_URL ?? "https://api.meta.ai/v1").replace(/\/$/, "");
const model = process.env.META_MODEL ?? "muse-spark-1.3";
const key = process.env.MODEL_API_KEY ?? "";
if (key.length === 0) {
  console.error("Missing MODEL_API_KEY");
  process.exit(1);
}

const b64 = readFileSync("fixtures/synthetic_smoke_01.png").toString("base64");
const res = await fetch(baseUrl + "/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
  body: JSON.stringify({
    model: model,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Reply with a single JSON object only." },
      { role: "user", content: [
        { type: "text", text: "Read the math problem in the image. Reply JSON: {problem, student_answer}." },
        { type: "image_url", image_url: { url: "data:image/png;base64," + b64 } },
      ]},
    ],
  }),
});
const text = await res.text();
console.log("HTTP " + res.status);
const data = JSON.parse(text);
const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : text;
console.log("CONTENT: " + String(content).slice(0, 500));
JSON.parse(content);
console.log("SMOKE OK: valid JSON from model");



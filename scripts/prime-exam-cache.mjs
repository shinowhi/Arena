// Prime exam sets for V-ACT + HSA: forge full multiple-choice sections and
// upsert them as the current paper. Papers regenerate every 2 days (NOT per
// user), so forging is slow and careful; readers only see finished papers.
// Run from anywhere: npx -y tsx <arena>/scripts/prime-exam-cache.mjs [--only vact_math] [--limit N] [--dry-run]
// Needs <arena>/.env.local (MODEL_API_KEY + Supabase). Mirror of EXAM_SET_VERSION
// in lib/agents/exam.ts: bump together.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXAM_SET_VERSION } from "../lib/agents/exam.ts";
import { forgeSection, SECTION_SUBJECTS } from "../lib/agents/subject-forge.ts";

const ARENA = join(dirname(fileURLToPath(import.meta.url)), "..");

const FRESH_MS = 48 * 3600 * 1000;
const CONCURRENCY = 2;

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 0 : 0;
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1].split(",").map((s) => s.trim()).filter(Boolean) : [];
const DRY_RUN = args.includes("--dry-run");

function loadEnv() {
  const env = readFileSync(join(ARENA, ".env.local"), "utf8");
  const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
  const MODEL_API_KEY = get("MODEL_API_KEY");
  const URL = get("NEXT_PUBLIC_SUPABASE_URL");
  // Post-0019 the anon key cannot write: prefer the service key, warn fallback.
  const ANON = get("SUPABASE_SERVICE_ROLE_KEY") || get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!get("SUPABASE_SERVICE_ROLE_KEY")) console.warn("prime: no service key, writes will fail post-0019.");
  if (!URL || !ANON || (!DRY_RUN && !MODEL_API_KEY)) throw new Error("Missing keys in <arena>/.env.local.");
  if (MODEL_API_KEY) process.env.MODEL_API_KEY = MODEL_API_KEY;
  const base = env.match(/^META_MODEL_API_BASE_URL=(.+)$/m)?.[1]?.trim();
  const model = env.match(/^META_MODEL=(.+)$/m)?.[1]?.trim();
  if (base) process.env.META_MODEL_API_BASE_URL = base;
  if (model) process.env.META_MODEL = model;
  return { URL, ANON };
}

const { URL, ANON } = loadEnv();
const ALL = Object.keys(SECTION_SUBJECTS);

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`REST ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return text.length > 0 ? JSON.parse(text) : null;
}

const rows = await rest(`boss_question_cache?select=skill_tag,fetched_at,set_version&set_version=eq.${EXAM_SET_VERSION}`);
const fresh = new Set(
  rows
    .filter((r) => Date.now() - new Date(r.fetched_at).getTime() <= FRESH_MS)
    .map((r) => r.skill_tag),
);
let targets = ALL.filter((id) => !fresh.has(id));
if (ONLY.length > 0) {
  const want = new Set(ONLY);
  targets = targets.filter((id) => want.has(id));
}
if (LIMIT > 0) targets = targets.slice(0, LIMIT);
console.log(`Sections: ${ALL.length}, fresh: ${fresh.size}, to forge: ${targets.length}${DRY_RUN ? " (dry run)" : ""}`);
if (DRY_RUN) {
  for (const id of targets) console.log("  would forge " + id);
  process.exit(0);
}

async function forgeOne(sectionId) {
  const t0 = Date.now();
  const spec = { sectionId, ...SECTION_SUBJECTS[sectionId] };
  try {
    const out = await forgeSection(spec);
    if (out.questions.length < spec.count) {
      console.log(`SHORT ${sectionId}: ${out.questions.length}/${spec.count} — old paper keeps serving. Rejects: ${out.rejected.slice(0, 5).join(" | ").slice(0, 300)}`);
      return `${sectionId}: short ${out.questions.length}/${spec.count}`;
    }
    await rest("boss_question_cache", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        skill_tag: sectionId,
        set_version: EXAM_SET_VERSION,
        questions: out.questions,
        fetched_at: new Date().toISOString(),
      }),
    });
    console.log(`FORGED ${sectionId} ${out.questions.length}Q ${((Date.now() - t0) / 1000).toFixed(0)}s (rejected notes: ${out.rejected.length})`);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`FAIL ${sectionId}: ${msg.slice(0, 160)}`);
    return `${sectionId}: ${msg.slice(0, 160)}`;
  }
}

const failures = [];
let done = 0;
async function worker(queue) {
  while (queue.length > 0) {
    const id = queue.shift();
    const fail = await forgeOne(id);
    if (fail) failures.push(fail);
    done += 1;
    console.log(`Progress ${done}/${targets.length}`);
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)));
console.log(failures.length === 0 ? `PRIME DONE: forged=${targets.length} failed=0` : `PRIME DONE WITH FAILURES:\n${failures.join("\n")}`);
process.exit(failures.length === 0 ? 0 : 1);

// Prime boss_question_cache for every skill in the graph: forge verified
// 5-question sets and upsert them as ownerless templates. No boss rows created.
// Run from arena/: npx -y tsx scripts/prime-boss-cache.mjs [--limit N] [--dry-run]
// Needs arena/.env.local (MODEL_API_KEY + Supabase). Mirror of the cache key
// in lib/game/boss-cache.ts (BOSS_SET_VERSION): bump together.
import { readFileSync } from "node:fs";
import { generateBossQuestions } from "../lib/agents/boss-generator.ts";

const SET_VERSION = 1;
const FRESH_MS = 12 * 3600 * 1000;
const CONCURRENCY = 3;

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 0 : 0;
const DRY_RUN = args.includes("--dry-run");

function loadEnv() {
  const env = readFileSync("arena/.env.local", "utf8");
  const get = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim();
  const MODEL_API_KEY = get("MODEL_API_KEY");
  const URL = get("NEXT_PUBLIC_SUPABASE_URL");
  const ANON = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!MODEL_API_KEY || !URL || !ANON) throw new Error("Missing keys in arena/.env.local.");
  process.env.MODEL_API_KEY = MODEL_API_KEY;
  const base = env.match(/^META_MODEL_API_BASE_URL=(.+)$/m)?.[1]?.trim();
  const model = env.match(/^META_MODEL=(.+)$/m)?.[1]?.trim();
  if (base) process.env.META_MODEL_API_BASE_URL = base;
  if (model) process.env.META_MODEL = model;
  return { URL, ANON };
}

const { URL, ANON } = loadEnv();
const graph = JSON.parse(readFileSync("arena/lib/graph/skill-graph.json", "utf8"));
const ALL = graph.skills.map((s) => s.id);

async function rest(path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`REST ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return text.length > 0 ? JSON.parse(text) : null;
}

const rows = await rest("boss_question_cache?select=skill_tag,fetched_at,set_version");
const fresh = new Set(
  rows
    .filter((r) => r.set_version === SET_VERSION && Date.now() - new Date(r.fetched_at).getTime() <= FRESH_MS)
    .map((r) => r.skill_tag),
);
let targets = ALL.filter((id) => !fresh.has(id));
if (LIMIT > 0) targets = targets.slice(0, LIMIT);
console.log(`Skills: ${ALL.length}, fresh: ${fresh.size}, to forge: ${targets.length}${DRY_RUN ? " (dry run)" : ""}`);
if (DRY_RUN) {
  for (const id of targets) console.log("  would forge " + id);
  process.exit(0);
}

async function forgeOne(skill) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    try {
      const out = await generateBossQuestions(skill);
      await rest("boss_question_cache", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          skill_tag: skill,
          set_version: SET_VERSION,
          questions: out.questions,
          fetched_at: new Date().toISOString(),
        }),
      });
      console.log(`FORGED ${skill} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ATTEMPT ${attempt} FAIL ${skill}: ${msg.slice(0, 160)}`);
      if (attempt === 2) return `${skill}: ${msg.slice(0, 160)}`;
    }
  }
  return `${skill}: unreachable`;
}

const failures = [];
let done = 0;
async function worker(queue) {
  while (queue.length > 0) {
    const skill = queue.shift();
    const fail = await forgeOne(skill);
    done += 1;
    if (fail) failures.push(fail);
    console.log(`--- progress ${done}/${targets.length} ---`);
  }
}
const queue = [...targets];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue)));
console.log(`PRIME DONE: forged=${targets.length - failures.length} failed=${failures.length}`);
for (const f of failures) console.log("FAILED " + f);
process.exit(failures.length > 0 ? 1 : 0);

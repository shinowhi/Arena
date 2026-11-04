# Arena

Scan your math homework, find the weak skill and its **root cause**, then slay a boss of 5 machine-verified questions.

Built for the **Meta Global AI Developer Hackathon** (theme: *Build for Your World*). All code in this repo was written during the contest window (first commit Oct 29, 2026). Live demo: `https://arena-shinowhi.vercel.app`

## How it works

1. **Scan** (`/scan`) — upload a photo of handwritten math work, or pick a pre-verified sample photo. Agent 1 (vision) breaks it into problems; Agent 2 maps mistakes to a hand-written 50-skill Calculus + Mechanics prerequisite graph and reports `weak_skill` + `root_cause`.
2. **Summon** — Agent 3 generates a Boss: 5 isomorphic questions (same shape, new numbers, rising difficulty), numeric answers only.
3. **Verify** — every generated answer is recomputed with `mathjs` before it is stored. Wrong or uncomputable questions are discarded and regenerated (max 3 rounds). The LLM is never trusted for answers.
4. **Fight** (`/boss/[id]`) — answer one question at a time; each correct answer deals 20 damage, builds a combo streak, and shows a machine-verified badge. Grading happens server-side; answers are never sent to the client. High-HP bosses loop questions until slain; the victory screen shows your clear time.
5. **Arena** (`/arena`) — live world boss with shared HP over Supabase Realtime, countdown, lazy on-visit spawn from the most-missed skills of the last 24h.
6. **Invite** — `/arena?invite=<playerId>` gives **+50 XP to both** players (pair-tracked, rewarded once). Header shows level + XP.
7. **Leaderboard** — top 10 hunters on /arena by bosses slain (XP breaks ties), computed from existing tables, no extra migration.
8. **Heroes & bosses** — click your avatar on /arena to pick 1 of 4 rigged heroes (torso + independently animated arms, saved in browser). Bosses wear rarity bodies; your hero lunges and fires its skill on every hit.

## Meta model usage

All LLM calls go through `lib/llm/meta.ts` (single gateway: JSON mode, zod validation, schema retries, `max_tokens >= 4000`).

| Agent | Model | File |
|---|---|---|
| Agent 1 Vision Decomposer (multimodal, reads photos directly, no OCR) | `muse-spark-1.3` | `lib/agents/vision-decomposer.ts` |
| Agent 2 Gap Finder | `muse-spark-1.3` | `lib/agents/gap-finder.ts` |
| Agent 3 Boss Generator | `muse-spark-1.3` | `lib/agents/boss-generator.ts` |

Base URL, model, and key are env-configurable (`META_MODEL_API_BASE_URL`, `META_MODEL`, `MODEL_API_KEY`, server-side only).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in keys, never commit .env.local
# Apply supabase/migrations/*.sql in order in your Supabase project (SQL editor)
node scripts/seed.mjs        # optional demo data, labeled seed-demo
npm run dev
```

Probes (need `MODEL_API_KEY` + Supabase env): `npx -y tsx scripts/probe-scan.mjs [limit]`, `npx -y tsx scripts/probe-boss.mjs <skill>`. Offline tests: `node scripts/test-agent-contracts.mjs` (82), `node scripts/test-boss.mjs` (11), `node scripts/test-social.mjs` (44), `node scripts/test-samples.mjs` (22).

## Env

| Var | Purpose |
|---|---|
| `MODEL_API_KEY` | Meta Model API key (server only) |
| `META_MODEL_API_BASE_URL` | Default `https://api.meta.ai/v1` |
| `META_MODEL` | Default `muse-spark-1.3` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (publishable key only) |
| `BOSS_TTL_SECONDS` | Boss lifetime in seconds (default 14400) |
| `WORLD_BOSS_HP` | World boss HP (default 1000) |
| `RUSH_BOSS_HP` | Daily-rush boss HP (default 2000) |

## Sample data

- `fixtures/` — sample homework photos for testing.
- `public/samples/` — 2 pre-verified photos wired to one-click sample buttons on `/scan`.
- `scripts/seed.mjs` — inserts 1 player + 6 scans labeled `seed-demo`.
- World-boss fallback skills (when under 24h of real data) come from this seed.

## Stack

Next.js App Router + TypeScript + Tailwind · Supabase (Postgres + Realtime) · Vercel · mathjs · KaTeX.
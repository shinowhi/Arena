# Open questions (M0)

1. Meta Model API (VERIFIED 28/10): base URL `https://api.meta.ai/v1` + model
   `muse-spark-1.3` work. `scripts/smoke-model.mjs` returned HTTP 200 with valid
   JSON, correctly reading both problems and student answers from the image.
   Key lives in machine env and `arena/.env.local` (gitignored, local only).
2. Supabase/Vercel linkage (UNVERIFIED): user says linked, but no
   `.vercel`/`.env`/CLI session exists on this machine. Needed from M3:
   `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
   `arena/.env.local`; Vercel link at M5.
3. Fixtures: M1 agent tests need 10 real Calculus problem photos; the current
   PNG is a synthetic smoke-test placeholder only.

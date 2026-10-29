# Open questions (all resolved)

1. Meta Model API (RESOLVED 28/10): base URL `https://api.meta.ai/v1` + model
   `muse-spark-1.3` work. `scripts/smoke-model.mjs` returned HTTP 200 with valid
   JSON, correctly reading both problems and student answers from the image.
   Key lives in machine env and `arena/.env.local` (gitignored, local only).
2. Supabase/Vercel linkage (RESOLVED 29/10): production deploy Ready at
   `https://arena-shinowhi.vercel.app`, protection OFF. 7 env vars set on Vercel;
   `/api/arena/active-bosses` verified returning a real boss over the public link.
3. Fixtures (RESOLVED 29/10): `fixtures/` now holds ~37 real homework photos plus
   2 verified real PNGs (`real_area_integral_01.png`, `real_implicit_diff_01.png`);
   the synthetic smoke PNG stays for offline tests only.

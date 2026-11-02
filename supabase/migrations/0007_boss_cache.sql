-- 0007: per-skill boss question cache (ownerless verified templates).
-- Run AFTER 0006 in Supabase SQL editor. Safe to re-run (IF NOT EXISTS).
-- NOTE: user needs to run this in the Supabase SQL editor; until then the
-- summon/photo-problem routes take the slower LLM path automatically (a cache
-- miss behaves exactly like the old code, so no banner is needed).
--
-- Rows are OWNERLESS templates: summon clones the cached question set into a
-- fresh owned boss row per viewer. Never serve one viewer's boss to another.

create table if not exists boss_question_cache (
  skill_tag text not null,
  set_version int not null,
  questions jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (skill_tag, set_version)
);

-- ---------- RLS (demo-open, same as 0001/0005/0006) ----------
alter table boss_question_cache enable row level security;

drop policy if exists open_all on boss_question_cache;
create policy open_all on boss_question_cache for all using (true) with check (true);

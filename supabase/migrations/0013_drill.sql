-- 0013: drill hub (P4.1 self-practice sets + per-question attempts).
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / IF EXISTS).
-- player_id is text (same anonymous-cookie convention as funnel_events).
-- drill_sets.paper holds FULL questions WITH answer keys: server-side only,
-- never selected by the client; the drill GET route strips keys app-side.
-- Anon SELECT+INSERT open, NO update/delete: the server uses the anon key
-- (can't distinguish owners), so ownership is enforced app-side per request
-- (same rationale as 0011_funnel.sql); forbidding update/delete keeps stored
-- keys and attempt logs tamper-proof.

create table if not exists drill_sets (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  title text not null,
  source text not null check (source in ('weak', 'misses', 'topic', 'upload')),
  skill_tags text[] not null default '{}',
  paper jsonb not null,
  created_at timestamptz default now()
);

create table if not exists paper_attempts (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references drill_sets(id) on delete cascade,
  player_id text not null,
  skill_tag text not null,
  correct boolean not null,
  created_at timestamptz default now()
);

alter table drill_sets enable row level security;
alter table paper_attempts enable row level security;
drop policy if exists drill_sets_insert on drill_sets;
drop policy if exists drill_sets_select on drill_sets;
drop policy if exists paper_attempts_insert on paper_attempts;
drop policy if exists paper_attempts_select on paper_attempts;
create policy drill_sets_insert on drill_sets for insert with check (true);
create policy drill_sets_select on drill_sets for select using (true);
create policy paper_attempts_insert on paper_attempts for insert with check (true);
create policy paper_attempts_select on paper_attempts for select using (true);

create index if not exists paper_attempts_player_created_idx
  on paper_attempts (player_id, created_at desc);

create index if not exists drill_sets_player_created_idx
  on drill_sets (player_id, created_at desc);

-- DOWN (rollback, never run unless reverting the drill hub):
-- drop index if exists drill_sets_player_created_idx;
-- drop index if exists paper_attempts_player_created_idx;
-- drop table if exists paper_attempts;
-- drop table if exists drill_sets;

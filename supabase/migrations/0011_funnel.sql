-- 0011: funnel events (P1 education funnel analytics).
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / IF EXISTS).
-- player_id is text (same convention as exam_attempts in 0010: anonymous
-- cookie ids, nullable so cookieless routes can log too).
-- Anon insert+select accepted (pseudonymous UUIDs + label meta only);
-- mutations (update/delete) forbidden. Service-role tightening is future work.

create table if not exists funnel_events (
  id uuid primary key default gen_random_uuid(),
  player_id text,
  event text not null,
  meta jsonb,
  created_at timestamptz default now()
);

alter table funnel_events enable row level security;
drop policy if exists open_all on funnel_events;
drop policy if exists funnel_insert on funnel_events;
drop policy if exists funnel_select on funnel_events;
create policy funnel_insert on funnel_events for insert with check (true);
create policy funnel_select on funnel_events for select using (true);

create index if not exists funnel_events_event_created_idx on funnel_events (event, created_at desc);

-- DOWN (rollback, never run unless reverting the funnel):
-- drop table if exists funnel_events;

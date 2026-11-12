-- 0015: tutor threads + messages (P4.4 VIP TUTOR+ memory).
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / DROP POLICY
-- IF EXISTS).
--
-- Tables:
--   tutor_threads  (id uuid pk, player_id text, title, created_at)
--   tutor_messages (id uuid pk, thread_id fk cascade, role user|assistant, content, created_at)
-- player_id is text (same anonymous-cookie convention as funnel_events).
--
-- SECURITY MODEL (read before changing):
-- The anon key is PUBLIC (it ships in the client bundle) and cannot
-- distinguish thread owners, so ownership is enforced APP-SIDE: every route
-- filters by the server-resolved player_id and rejects foreign thread_ids
-- (403 in app/api/tutor/chat/route.ts). Policies:
--   * SELECT + INSERT open for anon (the server uses the anon SSR client).
--   * NO update/delete policies: threads are append-only history. There is
--     deliberately NO updated_at column — threads order by created_at desc —
--     so nothing ever needs UPDATE; a future updater needs a later migration.
-- Residual risk: anyone holding the anon key can read/insert raw rows. Chat
-- content is pseudonymous (player ids, no names or emails), the same exposure
-- class as funnel_events — accepted for P4.4; tighten with per-owner JWT
-- claims if real auth ever lands.
--
-- DOWN (rollback, never run unless reverting tutor memory):
-- drop index if exists tutor_messages_thread_created_idx;
-- drop index if exists tutor_threads_player_created_idx;
-- drop table if exists tutor_messages;
-- drop table if exists tutor_threads;

create table if not exists tutor_threads (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  title text not null default 'Chat',
  created_at timestamptz default now()
);

create table if not exists tutor_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references tutor_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table tutor_threads enable row level security;
alter table tutor_messages enable row level security;

drop policy if exists tutor_threads_select on tutor_threads;
create policy tutor_threads_select on tutor_threads for select using (true);
drop policy if exists tutor_threads_insert on tutor_threads;
create policy tutor_threads_insert on tutor_threads for insert with check (true);
drop policy if exists tutor_messages_select on tutor_messages;
create policy tutor_messages_select on tutor_messages for select using (true);
drop policy if exists tutor_messages_insert on tutor_messages;
create policy tutor_messages_insert on tutor_messages for insert with check (true);
-- NO update/delete policies (append-only; see header).

create index if not exists tutor_threads_player_created_idx
  on tutor_threads (player_id, created_at desc);
create index if not exists tutor_messages_thread_created_idx
  on tutor_messages (thread_id, created_at);

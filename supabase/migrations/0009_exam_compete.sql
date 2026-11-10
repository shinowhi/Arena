-- 0009: exam competition tables (Day 1 duel+ELO; Day 4 rooms appended below).
-- Additive only. User runs this file ONCE in Supabase SQL editor.
-- Down (if ever needed): drop table if exists exam_room_players; drop table if exists exam_rooms; drop table if exists exam_elo; drop table if exists exam_duels;
-- NOTE: this project enables RLS by default on new tables, so every table
-- below gets an explicit open policy (demo posture, same as 0001/0008;
-- harden post-judging).

-- Day 1: head-to-head exam duels over ONE cached section. The paper is
-- SNAPSHOT into the duel row at create (keys included, server-side only), so
-- cache refreshes and the review endpoint can never leak or void a live duel.
create table if not exists exam_duels (
  id uuid primary key default gen_random_uuid(),
  exam text not null check (exam in ('vact', 'hsa')),
  section_id text not null,
  set_as_of timestamptz not null,
  paper jsonb not null,
  p1_player_id text not null,
  p2_player_id text,
  p1_score int,
  p2_score int,
  p1_done_at timestamptz,
  p2_done_at timestamptz,
  status text not null default 'waiting' check (status in ('waiting', 'live', 'finished')),
  winner text check (winner in ('p1', 'p2', 'draw')),
  elo_done boolean not null default false,
  created_at timestamptz not null default now()
);

-- Day 1: ELO per exam. Starts at 1200, K=32 (see lib/game/duel.ts).
create table if not exists exam_elo (
  player_id text not null,
  exam text not null check (exam in ('vact', 'hsa')),
  rating int not null default 1200,
  games int not null default 0,
  primary key (player_id, exam)
);

-- Day 4: battle royale rooms. Paper snapshot (10Q) at create; players in a
-- side table for atomic per-row updates. Rounds close lazily on read.
create table if not exists exam_rooms (
  id uuid primary key default gen_random_uuid(),
  exam text not null check (exam in ('vact', 'hsa')),
  section_id text not null,
  paper jsonb not null,
  creator_player_id text not null,
  status text not null default 'lobby' check (status in ('lobby', 'live', 'finished')),
  round int not null default 0,
  round_started_at timestamptz,
  round_ends_at timestamptz,
  winner text,
  created_at timestamptz not null default now()
);

create table if not exists exam_room_players (
  room_id uuid not null references exam_rooms(id) on delete cascade,
  player_id text not null,
  alive boolean not null default true,
  score int not null default 0,
  answered int not null default -1,
  last_ms int not null default 0,
  primary key (room_id, player_id)
);

-- Race-safe join: row-locked count check, 8 cap enforced in the DB.
-- Returns 'ok' | 'missing' | 'started' | 'full'.
create or replace function join_room(p_room uuid, p_player text) returns text as $$
declare
  st text;
  cnt int;
begin
  select status into st from exam_rooms where id = p_room for update;
  if st is null then return 'missing'; end if;
  if st <> 'lobby' then return 'started'; end if;
  insert into exam_room_players(room_id, player_id) values (p_room, p_player) on conflict do nothing;
  select count(*) into cnt from exam_room_players where room_id = p_room;
  if cnt > 8 then
    delete from exam_room_players where room_id = p_room and player_id = p_player;
    return 'full';
  end if;
  return 'ok';
end;
$$ language plpgsql;

alter table exam_duels enable row level security;
drop policy if exists open_all on exam_duels;
create policy open_all on exam_duels for all using (true) with check (true);

alter table exam_elo enable row level security;
drop policy if exists open_all on exam_elo;
create policy open_all on exam_elo for all using (true) with check (true);

alter table exam_rooms enable row level security;
drop policy if exists open_all on exam_rooms;
create policy open_all on exam_rooms for all using (true) with check (true);

alter table exam_room_players enable row level security;
drop policy if exists open_all on exam_room_players;
create policy open_all on exam_room_players for all using (true) with check (true);

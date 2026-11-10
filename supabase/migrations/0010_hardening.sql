-- 0010: post-judging hardening (atomic duel ELO + exam attempt gate).
-- Run ONCE in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE).
--
-- RLS POSTURE (explicit, no behavior change): this app's server uses the
-- ANON key (see lib/supabase/server.ts), so anon reads/writes cannot be
-- revoked without breaking the app. Every table therefore keeps the same
-- open_all policy as 0001/0008/0009. Per-user RLS policies require a future
-- auth migration (real user identities); until then this comment is the
-- documented decision — do NOT "harden" 0001 by revoking anon.
--
-- Down (if ever needed):
--   drop function if exists settle_duel_elo(uuid);
--   drop table if exists exam_attempts;

-- First-fetch stamp per player/exam/day. The mock routes insert with
-- ON CONFLICT DO NOTHING (first fetch wins); /api/exam/review only serves
-- keys once started_at + the paper clock has expired.
create table if not exists exam_attempts (
  player_id text not null,
  exam text not null check (exam in ('vact', 'hsa', 'thpt')),
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  started_at timestamptz not null default now(),
  primary key (player_id, exam, day)
);

alter table exam_attempts enable row level security;
drop policy if exists open_all on exam_attempts;
create policy open_all on exam_attempts for all using (true) with check (true);

-- Atomic duel settlement: locks the duel row, so two duels sharing a player
-- can no longer interleave their ELO read-modify-write (the old TS path
-- raced across duels). Same rules as lib/game/duel.ts: K=32, draws split.
-- Returns the winner text ('p1' | 'p2' | 'draw'), or NULL when the duel is
-- not both-scored yet. Raises when the duel does not exist.
create or replace function settle_duel_elo(p_duel uuid) returns text as $$
declare
  d exam_duels%rowtype;
  w text;
  r record;
  ra int; rb int; ga int; gb int;
  sa double precision;
  ea double precision;
  na int; nb int;
begin
  select * into d from exam_duels where id = p_duel for update;
  if not found then raise exception 'duel not found'; end if;
  if d.status = 'finished' then return d.winner; end if;
  if d.elo_done then return d.winner; end if;
  if d.p1_score is null or d.p2_score is null or d.p2_player_id is null then
    return null;
  end if;
  -- Winner: higher score; ties go to the earlier submission; equal or
  -- missing timestamps draw (mirrors decideWinner in lib/game/duel.ts).
  if d.p1_score > d.p2_score then w := 'p1';
  elsif d.p1_score < d.p2_score then w := 'p2';
  elsif d.p1_done_at is null or d.p2_done_at is null then w := 'draw';
  elsif d.p1_done_at < d.p2_done_at then w := 'p1';
  elsif d.p1_done_at > d.p2_done_at then w := 'p2';
  else w := 'draw';
  end if;
  -- ELO under row locks: pre-insert missing rows at 1200/0 games
  -- (unrated), then lock both rows in one ordered SELECT so concurrent
  -- duels sharing a player serialize instead of interleaving.
  insert into exam_elo(player_id, exam, rating, games) values
    (d.p1_player_id, d.exam, 1200, 0),
    (d.p2_player_id, d.exam, 1200, 0)
  on conflict do nothing;
  for r in select player_id, rating, games from exam_elo
    where player_id in (d.p1_player_id, d.p2_player_id) and exam = d.exam
    order by player_id for update
  loop
    if r.player_id = d.p1_player_id then ra := r.rating; ga := r.games; end if;
    if r.player_id = d.p2_player_id then rb := r.rating; gb := r.games; end if;
  end loop;
  sa := case when w = 'draw' then 0.5 when w = 'p1' then 1.0 else 0.0 end;
  ea := 1.0 / (1.0 + power(10.0, (rb - ra)::double precision / 400.0));
  na := round(ra + 32 * (sa - ea))::int;
  nb := round(rb + 32 * ((1.0 - sa) - (1.0 - ea)))::int;
  insert into exam_elo(player_id, exam, rating, games) values
    (d.p1_player_id, d.exam, na, ga + 1),
    (d.p2_player_id, d.exam, nb, gb + 1)
  on conflict (player_id, exam) do update
    set rating = excluded.rating, games = excluded.games;
  update exam_duels set status = 'finished', winner = w, elo_done = true where id = p_duel;
  return w;
end;
$$ language plpgsql;

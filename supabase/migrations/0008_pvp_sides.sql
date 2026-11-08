-- 0008: PVP side claims (team duels). Run in Supabase SQL editor.
-- Safe to re-run (IF NOT EXISTS). A room is a shared boss row with
-- skill_tag 'pvp:<skill>'; each fighter claims side A or B once.
-- No other schema change: HP is derived from the attacks table.

create table if not exists pvp_sides (
  room_id uuid references bosses(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  side text not null check (side in ('A', 'B')),
  created_at timestamptz default now(),
  primary key (room_id, player_id)
);

alter table pvp_sides enable row level security;

drop policy if exists open_all on pvp_sides;
create policy open_all on pvp_sides for all using (true) with check (true);

-- DOWN (rollback, never run unless reverting PVP):
-- drop table if exists pvp_sides;

-- A3 Co-op Raid: live hit feed per boss.
create table raid_hits (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid references bosses(id),
  player_id uuid references players(id),
  damage int not null default 0,
  created_at timestamptz default now()
);
alter table raid_hits enable row level security;
create policy open_all on raid_hits for all using (true) with check (true);
alter publication supabase_realtime add table raid_hits;
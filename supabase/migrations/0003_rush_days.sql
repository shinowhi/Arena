-- B4 Daily Rush: one shared boss per day.
create table rush_days (
  day date primary key,
  boss_id uuid references bosses(id),
  seed text not null,
  created_at timestamptz default now()
);
alter table rush_days enable row level security;
create policy open_all on rush_days for all using (true) with check (true);
-- M3: players, scans, bosses, attacks + atomic attack_boss + realtime.
-- Anonymous demo game (no login, no PII): RLS enabled with open policies.

create table players (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  xp int not null default 0,
  created_at timestamptz default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id),
  questions jsonb not null,
  weak_skill text,
  root_cause text,
  confidence numeric,
  created_at timestamptz default now()
);

create type boss_rarity as enum ('COMMON','ELITE','LEGENDARY');
create type boss_status as enum ('ALIVE','DEAD','EXPIRED');

create table bosses (
  id uuid primary key default gen_random_uuid(),
  skill_tag text not null,
  rarity boss_rarity not null default 'COMMON',
  owner_player_id uuid references players(id),
  spawn_at timestamptz not null default now(),
  despawn_at timestamptz not null,
  max_hp int not null,
  current_hp int not null,
  status boss_status not null default 'ALIVE',
  questions jsonb not null
);

create table attacks (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid references bosses(id),
  player_id uuid references players(id),
  question_index int not null,
  correct boolean not null,
  damage int not null default 0,
  created_at timestamptz default now()
);

create or replace function attack_boss(p_boss_id uuid, p_damage int)
returns table (current_hp int, status boss_status)
language plpgsql as $$
declare
  v_hp int;
  v_status boss_status;
begin
  select b.current_hp, b.status into v_hp, v_status
  from bosses b where b.id = p_boss_id for update;
  if not found then raise exception 'boss not found'; end if;
  if v_status != 'ALIVE' then
    current_hp := v_hp; status := v_status; return next; return;
  end if;
  v_hp := greatest(0, v_hp - p_damage);
  v_status := case when v_hp <= 0 then 'DEAD' else 'ALIVE' end;
  update bosses b set current_hp = v_hp, status = v_status where b.id = p_boss_id;
  current_hp := v_hp; status := v_status; return next;
end $$;

alter table players enable row level security;
alter table scans enable row level security;
alter table bosses enable row level security;
alter table attacks enable row level security;

create policy open_all on players for all using (true) with check (true);
create policy open_all on scans for all using (true) with check (true);
create policy open_all on bosses for all using (true) with check (true);
create policy open_all on attacks for all using (true) with check (true);

alter publication supabase_realtime add table bosses;

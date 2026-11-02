-- 0006: social — friends, 1-1 chat, groups, challenges, gifts, reports.
-- Run AFTER 0005 in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE).
-- NOTE: user needs to run this in the Supabase SQL editor; until then the
-- /friends, /chat and /groups pages show a friendly "database update needed" banner.

-- ---------- friend codes (shareable, one per player) ----------
create table if not exists player_codes (
  player_id uuid primary key references players(id),
  code text not null unique,
  created_at timestamptz default now()
);

-- ---------- friend requests (PENDING until accepted/declined) ----------
create table if not exists friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references players(id),
  to_id uuid not null references players(id),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED')),
  created_at timestamptz default now(),
  check (from_id != to_id),
  unique (from_id, to_id)
);
create index if not exists friend_requests_to_idx on friend_requests(to_id, status);
create index if not exists friend_requests_from_idx on friend_requests(from_id, status);

-- ---------- blocks (API enforces BOTH directions: either side blocks all contact) ----------
create table if not exists friend_blocks (
  blocker_id uuid not null references players(id),
  blocked_id uuid not null references players(id),
  created_at timestamptz default now(),
  check (blocker_id != blocked_id),
  primary key (blocker_id, blocked_id)
);

-- ---------- 1-1 chat (friends-only enforced server-side; 500-char cap) ----------
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references players(id),
  to_id uuid not null references players(id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz default now()
);
create index if not exists direct_messages_pair_idx on direct_messages(from_id, to_id, created_at);
create index if not exists direct_messages_from_time_idx on direct_messages(from_id, created_at);

-- ---------- groups ----------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner_id uuid not null references players(id),
  created_at timestamptz default now()
);
create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  player_id uuid not null references players(id),
  joined_at timestamptz default now(),
  primary key (group_id, player_id)
);
create index if not exists group_members_player_idx on group_members(player_id);
create table if not exists group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_id uuid not null references players(id),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz default now()
);
create index if not exists group_messages_group_idx on group_messages(group_id, created_at);

-- ---------- boss-duel challenges (boss_id links a real /boss/[id]) ----------
create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references players(id),
  to_id uuid not null references players(id),
  boss_id uuid not null references bosses(id),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED')),
  created_at timestamptz default now(),
  check (from_id != to_id)
);
create index if not exists challenges_to_idx on challenges(to_id, status);
create index if not exists challenges_from_idx on challenges(from_id, status);

-- ---------- gifts (XP and/or an item label, moved atomically by send_gift) ----------
create table if not exists gifts (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references players(id),
  to_id uuid not null references players(id),
  xp_amount int not null default 0 check (xp_amount >= 0),
  item text check (item is null or char_length(item) between 1 and 40),
  created_at timestamptz default now(),
  check (from_id != to_id)
);
create index if not exists gifts_to_idx on gifts(to_id, created_at);
create index if not exists gifts_from_idx on gifts(from_id, created_at);

-- ---------- reports ----------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references players(id),
  reported_id uuid not null references players(id),
  reason text not null check (char_length(reason) between 1 and 60),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz default now(),
  check (reporter_id != reported_id)
);

-- Atomic gift: moves XP sender -> recipient and records the gift row.
-- Never lets either balance go negative; raises on bad input.
create or replace function send_gift(p_from uuid, p_to uuid, p_xp int, p_item text)
returns uuid
language plpgsql as $$
declare
  v_from_xp int;
  v_id uuid;
begin
  if p_from = p_to then raise exception 'cannot gift yourself'; end if;
  if p_xp is null or p_xp < 0 or p_xp > 50 then raise exception 'bad xp amount'; end if;
  if p_xp = 0 and (p_item is null or length(trim(p_item)) = 0) then
    raise exception 'empty gift';
  end if;
  select p.xp into v_from_xp from players p where p.id = p_from for update;
  if not found then raise exception 'sender not found'; end if;
  perform 1 from players p where p.id = p_to;
  if not found then raise exception 'recipient not found'; end if;
  if v_from_xp < p_xp then raise exception 'insufficient xp'; end if;
  if p_xp > 0 then
    update players p set xp = v_from_xp - p_xp where p.id = p_from;
    update players p set xp = p.xp + p_xp where p.id = p_to;
  end if;
  insert into gifts (from_id, to_id, xp_amount, item)
  values (p_from, p_to, p_xp, nullif(trim(coalesce(p_item, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---------- RLS (demo-open, same as 0001/0005) ----------
alter table player_codes enable row level security;
alter table friend_requests enable row level security;
alter table friend_blocks enable row level security;
alter table direct_messages enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_messages enable row level security;
alter table challenges enable row level security;
alter table gifts enable row level security;
alter table reports enable row level security;

drop policy if exists open_all on player_codes;
drop policy if exists open_all on friend_requests;
drop policy if exists open_all on friend_blocks;
drop policy if exists open_all on direct_messages;
drop policy if exists open_all on groups;
drop policy if exists open_all on group_members;
drop policy if exists open_all on group_messages;
drop policy if exists open_all on challenges;
drop policy if exists open_all on gifts;
drop policy if exists open_all on reports;
create policy open_all on player_codes for all using (true) with check (true);
create policy open_all on friend_requests for all using (true) with check (true);
create policy open_all on friend_blocks for all using (true) with check (true);
create policy open_all on direct_messages for all using (true) with check (true);
create policy open_all on groups for all using (true) with check (true);
create policy open_all on group_members for all using (true) with check (true);
create policy open_all on group_messages for all using (true) with check (true);
create policy open_all on challenges for all using (true) with check (true);
create policy open_all on gifts for all using (true) with check (true);
create policy open_all on reports for all using (true) with check (true);

-- 0017: family plans + tables (P5: parent links kids, kids share VIP).
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / DROP POLICY
-- IF EXISTS / ON CONFLICT upsert). Depends on 0016 (plans, subscriptions).
--
-- AMOUNTS (coordinator-locked: family 79k/2-kids + 119k/4-kids; also mirrored
-- in lib/billing/plans.ts FAMILY_SEATS + the family_2/family_4 rows — single
-- constants each, flagged for user/A confirm):
--   family_2  79,000 VND / 30 days  (product bundle, 2 kid seats)
--   family_4 119,000 VND / 30 days  (product bundle, 4 kid seats)
--   link_code format: 8 uppercase alphanumerics (no look-alikes 0/O/1/I),
--   app-generated, unique per family (see lib/family/family.ts).
--
-- Tables:
--   families       (parent_player_id, plan_code, status
--                   active|expired|cancelled, link_code unique)
--   family_members (family_id -> families cascade, child_player_id UNIQUE:
--                   one family per child, enforced by the DB)
-- player ids are text (same anonymous-cookie convention as 0016).
--
-- SECURITY MODEL (same shape as 0016 — read before changing):
-- The anon key is PUBLIC, so it must confer no power to grant entitlements.
--   * families + family_members are SELECT+INSERT for anon (parents create
--     their own family, kids join by code; NO update/delete — status flips
--     and removals need a logged-in admin path, v2). RESIDUAL EXPOSURE: anon
--     SELECT is unscoped, so any client can read ALL link codes and member
--     lists (pseudonymous player UUIDs, same exposure class as funnel_events
--     / orders memos). Scoped policies need login (v2).
--   * NO service RPCs: app-side checks suffice — creation is gated by the
--     parent's own ACTIVE family subscription (route returns 402 otherwise),
--     and joins are capped by plan seats (route checks the member count
--     before inserting; the child_player_id UNIQUE index serializes
--     concurrent joins of the same kid, and a seat race at worst over-fills
--     by one row, which the route reports and the parent sees).
--   * A lapsed parent subscription does NOT auto-expire the family row
--     (status flips need the v2 admin path); access checks
--     (hasFamilyVip) always re-verify the parent's live subscription, so a
--     lapsed family grants nothing even while its row says active.

-- Family catalog rows (refresh on re-run like the 0016 seed; keep
-- active=true — same documented caveat: pause via targeted UPDATE after
-- migrating, or edit the seed row).
insert into plans (code, name, product, price_vnd, period_days, active) values
  ('family_2', 'Family 2 kids', 'bundle', 79000, 30, true),
  ('family_4', 'Family 4 kids', 'bundle', 119000, 30, true)
on conflict (code) do update set
  name = excluded.name,
  product = excluded.product,
  price_vnd = excluded.price_vnd,
  period_days = excluded.period_days,
  active = excluded.active;

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  parent_player_id text not null,
  plan_code text not null references plans(code),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  link_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_player_id text not null,
  created_at timestamptz default now(),
  unique (child_player_id)
);

alter table families enable row level security;
alter table family_members enable row level security;

drop policy if exists families_select on families;
create policy families_select on families for select using (true);
drop policy if exists families_insert on families;
create policy families_insert on families for insert with check (true);
-- families: NO update/delete (v2 admin path only).

drop policy if exists family_members_select on family_members;
create policy family_members_select on family_members for select using (true);
drop policy if exists family_members_insert on family_members;
create policy family_members_insert on family_members for insert with check (true);
-- family_members: NO update/delete (v2 admin path only).

create index if not exists families_parent_idx
  on families (parent_player_id, created_at desc);
create index if not exists family_members_family_idx
  on family_members (family_id);
create index if not exists family_members_child_idx
  on family_members (child_player_id);

-- One active family per parent: concurrent double-creates collide here and
-- the route re-fetches the winner instead of orphaning a second family.
create unique index if not exists families_parent_active_uidx
  on families (parent_player_id) where status = 'active';

-- DOWN (rollback, never run unless reverting family):
-- drop index if exists families_parent_active_uidx;
-- drop index if exists family_members_child_idx;
-- drop index if exists family_members_family_idx;
-- drop index if exists families_parent_idx;
-- drop table if exists family_members;
-- drop table if exists families;
-- delete from plans where code in ('family_2', 'family_4');

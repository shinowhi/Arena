-- 0018: learning-center classes (P6 CENTER: centers, classes, enrollments, assignments).
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE /
-- DROP POLICY IF EXISTS / ON CONFLICT upsert). Depends on 0016 (plans table).
--
-- TIERS (coordinator-flagged placeholders — user to confirm numbers; also
-- mirrored in lib/center/center.ts CLASS_TIERS, single constant):
--   class_20  780,000 VND / 30 days  (20 seats)
--   class_30  999,000 VND / 30 days  (30 seats, HERO tier)
--   class_50  1,490,000 VND / 30 days (50 seats)
--   All product 'bundle' so they flow through the existing orders catalog.
--
-- Tables:
--   centers     (id, name)
--   classes     (center_id nullable, name, teacher_player_id, plan_code,
--                seats, status pending|active|expired|cancelled, join_code unique)
--   enrollments (class_id, student_player_id, active; UNIQUE(class, student))
--   assignments (class_id, skill_tag, title, due_at nullable)
-- player ids are text (same anonymous-cookie convention as vip_claims/orders).
--
-- BILLING SPLIT (v1 manual phase, see POST /api/center/classes header):
-- creating a class costs nothing in-app but starts PENDING (grants nothing);
-- the center pays the tier price via the EXISTING orders flow (these plan
-- codes live in the same catalog), then the admin flips the class to active
-- with set_class_status via PATCH /api/admin/centers. Unpaid/expired classes
-- sit at expired/cancelled; students keep rows but lose enrollment VIP.
--
-- SECURITY MODEL (same shape as 0016 — read before changing):
--   * centers/classes/enrollments/assignments are SELECT+INSERT for anon
--     (any player may create a class or join by code; NO update/delete — a
--     student must never flip their own enrollment or a class status).
--     RESIDUAL EXPOSURE: anon SELECT is unscoped, so any client can read ALL
--     class rosters, join codes, and assignments (pseudonymous player UUIDs,
--     same exposure class as funnel_events/orders). Scoped per-owner reads
--     need login (v2).
--   * set_class_status is REVOKED from anon, authenticated, and public, and
--     GRANTED only to service_role (revoking from anon alone would change
--     nothing, because Postgres grants EXECUTE to PUBLIC by default). The
--     server calls it with the SERVICE-ROLE key after the ROUTE verifies the
--     admin cookie server-side (see app/api/admin/centers/route.ts).
--
-- RPCs:
--   set_class_status(p_class uuid, p_status text) returns text
--     Validates p_status in (pending|active|expired|cancelled), raising
--     class_bad_status otherwise; locks the class row FOR UPDATE, raising
--     class_not_found when missing; flips the status; returns the new status.
--     Admin-only (see above). New classes start pending and grant nothing
--     until the admin flips them active after confirming tier payment.

-- Tier seed: refresh on re-run so price/name fixes propagate (same
-- pause-caveat as 0016: a re-run resets active to true — re-pause after).
insert into plans (code, name, product, price_vnd, period_days, active) values
  ('class_20', 'Center Class 20', 'bundle', 780000, 30, true),
  ('class_30', 'Center Class 30', 'bundle', 999000, 30, true),
  ('class_50', 'Center Class 50', 'bundle', 1490000, 30, true)
on conflict (code) do update set
  name = excluded.name,
  product = excluded.product,
  price_vnd = excluded.price_vnd,
  period_days = excluded.period_days,
  active = excluded.active;

create table if not exists centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  center_id uuid null references centers(id) on delete cascade,
  name text not null,
  teacher_player_id text not null,
  plan_code text not null references plans(code),
  seats int not null check (seats > 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'cancelled')),
  join_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_player_id text not null,
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (class_id, student_player_id)
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  skill_tag text not null,
  title text not null,
  due_at timestamptz null,
  created_at timestamptz default now()
);

alter table centers enable row level security;
alter table classes enable row level security;
alter table enrollments enable row level security;
alter table assignments enable row level security;

drop policy if exists centers_select on centers;
create policy centers_select on centers for select using (true);
drop policy if exists centers_insert on centers;
create policy centers_insert on centers for insert with check (true);
-- centers: NO update/delete (admin service path only, future).

drop policy if exists classes_select on classes;
create policy classes_select on classes for select using (true);
drop policy if exists classes_insert on classes;
create policy classes_insert on classes for insert with check (true);
-- classes: NO update/delete (status flips go through set_class_status).

drop policy if exists enrollments_select on enrollments;
create policy enrollments_select on enrollments for select using (true);
drop policy if exists enrollments_insert on enrollments;
create policy enrollments_insert on enrollments for insert with check (true);
-- enrollments: NO update/delete (nothing flips active in v1).

drop policy if exists assignments_select on assignments;
create policy assignments_select on assignments for select using (true);
drop policy if exists assignments_insert on assignments;
create policy assignments_insert on assignments for insert with check (true);
-- assignments: NO update/delete (teacher-only insert is enforced in the route).

create index if not exists enrollments_student_idx
  on enrollments (student_player_id, class_id);
create index if not exists assignments_class_idx
  on assignments (class_id, created_at desc);

create or replace function set_class_status(p_class uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if p_status not in ('pending', 'active', 'expired', 'cancelled') then
    raise exception 'class_bad_status';
  end if;
  select status into v_status from classes where id = p_class for update;
  if not found then
    raise exception 'class_not_found';
  end if;
  update classes set status = p_status where id = p_class;
  return p_status;
end $$;

-- set_class_status is admin-only: revoke from every public role (anon and
-- authenticated hold direct default grants on Supabase, and PUBLIC holds the
-- Postgres default — all three must go) and grant only to service_role, which
-- the server uses (lib/supabase/service.ts).
revoke all on function set_class_status(uuid, text) from anon, authenticated, public;
grant execute on function set_class_status(uuid, text) to service_role;

-- DOWN (rollback, never run unless reverting centers):
-- drop function if exists set_class_status(uuid, text);
-- drop index if exists assignments_class_idx;
-- drop index if exists enrollments_student_idx;
-- drop table if exists assignments;
-- drop table if exists enrollments;
-- drop table if exists classes;
-- drop table if exists centers;
-- delete from plans where code in ('class_20', 'class_30', 'class_50');

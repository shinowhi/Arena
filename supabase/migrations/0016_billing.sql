-- 0016: billing infra (P4 slice-1: plans, subscriptions, orders, Xu ledger).
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE /
-- DROP POLICY IF EXISTS / ON CONFLICT upsert). No dependency on other P4 slices.
--
-- AMOUNTS (coordinator-flagged placeholders — user/A confirm; also mirrored in
-- lib/billing/plans.ts and lib/billing/xu.ts, single constants each):
--   scan_monthly  29,000 VND / 30 days   (product A "Study Unlock")
--   exam_monthly  29,000 VND / 30 days   (product B "Exam Packs")
--   bundle_monthly 49,000 VND / 30 days  (product bundle, HERO plan)
--   bundle_yearly 490,000 VND / 365 days (product bundle)
--   daily Xu claim: +100 Xu, once per player per UTC day (unique index below).
--   order memo format: ARENA-XXXXXX (6 uppercase alphanumerics, app-generated,
--   unique per order; the buyer puts it in the bank-transfer note).
--
-- Tables:
--   plans         (code pk, name, product A|B|bundle, price_vnd, period_days)
--   subscriptions (player_id, plan_code, starts_at, ends_at, status, order_id)
--   orders        (player_id, plan_code, amount_vnd, memo unique, status
--                  pending|approved|rejected, note, decided_at, payer_ref,
--                  device_id)
--   refunds       (order_id unique, player_id, payer_ref, status
--                  pending|approved|denied|credited, decided_at)
--   xu_ledger     (player_id, delta, reason; balance = sum(delta) per player)
-- player_id is text (same anonymous-cookie convention as funnel_events/vip_claims).
--
-- SECURITY MODEL (same shape as 0012 — read before changing):
-- The anon key is PUBLIC (it ships in the client bundle), so it must confer
-- no power to grant entitlements or money. Therefore:
--   * plans is SELECT-only for anon (public catalog: code/name/price only).
--   * orders is SELECT+INSERT for anon (buyers create their own pending order
--     and list their own; NO update/delete — a buyer must never flip their own
--     order to approved). RESIDUAL EXPOSURE: anon SELECT is unscoped, so any
--     client can read ALL pending memos/amounts (pseudonymous player UUIDs,
--     same exposure class as funnel_events). Scoped policies need login (v2).
--   * subscriptions is SELECT-only for anon (NO insert/update/delete — rows
--     are written ONLY by the approve_order RPC). RESIDUAL EXPOSURE: anon
--     SELECT is unscoped (same documented exposure as orders above); per-owner
--     reads need login (v2).
--   * xu_ledger is SELECT-only for anon (NO insert/update/delete): all writes
--     go through the claim_daily_xu RPC (SECURITY DEFINER, fixed +100, unique
--     index). An open INSERT would let any client mint arbitrary Xu, so it
--     stays closed — same shape as 0012 vip_claims.
--   * approve_order is REVOKED from anon, authenticated, and public, and
--     GRANTED only to service_role (revoking from anon alone would change
--     nothing, because Postgres grants EXECUTE to PUBLIC by default). The
--     server calls it with the SERVICE-ROLE key after the ROUTE verifies the
--     admin cookie server-side (see app/api/admin/orders/route.ts).
--   * claim_daily_xu STAYS executable by anon (PUBLIC): users claim through it,
--     and public execute is SAFE here because the amount (+100) is fixed
--     server-side inside the RPC and the xu_daily_uidx partial unique index
--     enforces once-per-player-per-UTC-day — there is no parameter to abuse.
--     Accepted nuisance (fix needs login-bound identity, v2): claim takes any
--     player_id text, so anyone can burn someone else's daily claim (victim
--     gets 409). The per-player 100/day cap still holds — griefing, not mint.
--   * refunds is SELECT-only for anon (NO insert/update/delete): refund rows
--     are written only by the service-role/admin path later (slice-2+).
--
-- REFUNDS (user lock, manual for now — zero automation code this slice):
--   window = 5 days from first purchase (REFUND_DAYS in lib/billing/plans.ts);
--   ladder = 1st refund auto-approved, 2nd manual review, 3rd denied-or-credit.
--   Both are enforced MANUALLY by the admin reading this table for now; no RPC
--   or route automates them in slice-1. order_id is UNIQUE: one refund row max
--   per order, so a double-submit collapses to a unique violation, never a
--   double refund.
--
-- RPCs:
--   approve_order(p_order uuid) returns uuid
--     Locks the order row FOR UPDATE; raises order_not_found / order_not_pending
--     / order_plan_inactive; flips the order to approved (+decided_at); inserts
--     the subscription (starts_at=now, ends_at=now+period_days, order_id set);
--     returns the new subscription id. Admin-only (see above).
--   claim_daily_xu(p_player text) returns int
--     Inserts (player, +100, 'daily'); returns the new balance. On the daily
--     unique violation raises xu_already_claimed. Public (see above).

create table if not exists plans (
  code text primary key,
  name text not null,
  product text not null check (product in ('A', 'B', 'bundle')),
  price_vnd int not null check (price_vnd >= 0),
  period_days int not null check (period_days > 0),
  active boolean not null default true
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  plan_code text not null references plans(code),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  order_id uuid null,
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  plan_code text not null references plans(code),
  amount_vnd int not null check (amount_vnd >= 0),
  memo text unique not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text null,
  created_at timestamptz default now(),
  decided_at timestamptz null,
  payer_ref text null,
  device_id text null
);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references orders(id),
  player_id text not null,
  payer_ref text null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'credited')),
  created_at timestamptz default now(),
  decided_at timestamptz null
);

create table if not exists xu_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  delta int not null,
  reason text not null,
  created_at timestamptz default now()
);

-- Seed the catalog (refresh on re-run so price/name fixes propagate; keep
-- active=true so a re-run never silently unpublishes a plan an admin paused
-- ... it DOES reset active to true — documented: pause-then-migrate reopens.
-- Prefer pausing via a targeted UPDATE after migrating, or edit the seed row.)
insert into plans (code, name, product, price_vnd, period_days, active) values
  ('scan_monthly', 'Study Unlock', 'A', 29000, 30, true),
  ('exam_monthly', 'Exam Packs', 'B', 29000, 30, true),
  ('bundle_monthly', 'Bundle', 'bundle', 49000, 30, true),
  ('bundle_yearly', 'Bundle Yearly', 'bundle', 490000, 365, true)
on conflict (code) do update set
  name = excluded.name,
  product = excluded.product,
  price_vnd = excluded.price_vnd,
  period_days = excluded.period_days,
  active = excluded.active;

alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table orders enable row level security;
alter table refunds enable row level security;
alter table xu_ledger enable row level security;

drop policy if exists plans_select on plans;
create policy plans_select on plans for select using (true);

drop policy if exists subscriptions_select on subscriptions;
create policy subscriptions_select on subscriptions for select using (true);
-- subscriptions: NO insert/update/delete (definer RPC only).

drop policy if exists orders_select on orders;
create policy orders_select on orders for select using (true);
drop policy if exists orders_insert on orders;
create policy orders_insert on orders for insert with check (true);
-- orders: NO update/delete (service-role admin path only).

drop policy if exists refunds_select on refunds;
create policy refunds_select on refunds for select using (true);
-- refunds: NO insert/update/delete (service-role/admin path only, slice-2+).

drop policy if exists xu_ledger_select on xu_ledger;
create policy xu_ledger_select on xu_ledger for select using (true);
drop policy if exists xu_ledger_insert on xu_ledger;
-- xu_ledger: NO insert/update/delete (RPC-only writes via claim_daily_xu).

create index if not exists subscriptions_player_idx
  on subscriptions (player_id, ends_at desc);
create index if not exists orders_player_idx
  on orders (player_id, created_at desc);
create index if not exists orders_status_idx
  on orders (status, created_at desc);
create index if not exists refunds_player_idx
  on refunds (player_id, created_at desc);
create index if not exists xu_ledger_player_idx
  on xu_ledger (player_id);

-- Anti-double-claim: one 'daily' row per player per UTC day. The RPC relies
-- on this index (not on a pre-check) so concurrent claims serialize safely.
create unique index if not exists xu_daily_uidx
  on xu_ledger (player_id, ((created_at at time zone 'UTC')::date))
  where reason = 'daily';

create or replace function approve_order(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_player text;
  v_plan text;
  v_amount int;
  v_days int;
  v_active boolean;
  v_price int;
  v_sub uuid;
begin
  select status, player_id, plan_code, amount_vnd into v_status, v_player, v_plan, v_amount
    from orders where id = p_order for update;
  if not found then
    raise exception 'order_not_found';
  end if;
  if v_status <> 'pending' then
    raise exception 'order_not_pending';
  end if;
  select period_days, active, price_vnd into v_days, v_active, v_price
    from plans where code = v_plan;
  if not found or coalesce(v_active, false) = false then
    raise exception 'order_plan_inactive';
  end if;
  -- Orders are anon-INSERTed, so a client can post amount_vnd=0: never let a
  -- rubber-stamp approval grant a full subscription on an underpaid order.
  if coalesce(v_amount, 0) < coalesce(v_price, 0) then
    raise exception 'order_underpaid';
  end if;
  update orders set status = 'approved', decided_at = now() where id = p_order;
  insert into subscriptions(player_id, plan_code, starts_at, ends_at, status, order_id)
    values (v_player, v_plan, now(), now() + (v_days || ' days')::interval, 'active', p_order)
    returning id into v_sub;
  return v_sub;
end $$;

create or replace function claim_daily_xu(p_player text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  begin
    insert into xu_ledger(player_id, delta, reason)
      values (p_player, 100, 'daily');
  exception when unique_violation then
    raise exception 'xu_already_claimed';
  end;
  select coalesce(sum(delta), 0) into v_balance
    from xu_ledger where player_id = p_player;
  return v_balance;
end $$;

-- approve_order is admin-only: revoke from every public role (anon and
-- authenticated hold direct default grants on Supabase, and PUBLIC holds the
-- Postgres default — all three must go) and grant only to service_role, which
-- the server uses (lib/supabase/service.ts). claim_daily_xu intentionally
-- keeps its PUBLIC execute (fixed +100 server-side + unique index — see header).
revoke all on function approve_order(uuid) from anon, authenticated, public;
grant execute on function approve_order(uuid) to service_role;

-- DOWN (rollback, never run unless reverting billing):
-- drop function if exists claim_daily_xu(text);
-- drop function if exists approve_order(uuid);
-- drop index if exists xu_daily_uidx;
-- drop index if exists xu_ledger_player_idx;
-- drop index if exists refunds_player_idx;
-- drop index if exists orders_status_idx;
-- drop index if exists orders_player_idx;
-- drop index if exists subscriptions_player_idx;
-- drop table if exists xu_ledger;
-- drop table if exists refunds;
-- drop table if exists orders;
-- drop table if exists subscriptions;
-- drop table if exists plans;

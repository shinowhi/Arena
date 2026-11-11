-- 0012: VIP codes (P2 monetization).
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS / OR REPLACE /
-- DROP POLICY IF EXISTS). Assumes 0011_funnel.sql applied (funnel_events index).
--
-- Tables:
--   vip_codes  (code pk, max_uses, used, expires_at, note, created_at)
--   vip_claims (player_id, code, vip_until, claimed_at; pk(player_id, code))
-- player_id is text (same anonymous-cookie convention as funnel_events).
-- Each claim extends vip_until to max(now, current max vip_until) + 30 days.
--
-- SECURITY MODEL (read before changing):
-- The anon key is PUBLIC (it ships in the client bundle), so it must confer
-- no admin power. The server calls the admin RPCs with the SERVICE-ROLE key
-- (see lib/supabase/service.ts) after the ROUTE verifies the admin cookie
-- server-side (see app/api/admin/codes/route.ts). Therefore:
--   * vip_codes has NO anon policies (deny-all): codes are listed/created only
--     through the SECURITY DEFINER RPCs below. EXECUTE on the admin_* RPCs is
--     REVOKED from anon, authenticated, and public, and GRANTED only to
--     service_role (see bottom): revoking from anon alone would change
--     nothing, because Postgres grants EXECUTE to PUBLIC by default. An open
--     SELECT would leak unredeemed codes; an open INSERT would mint free VIP.
--   * vip_claims is SELECT-only for anon (pseudonymous ids + timestamps, same
--     exposure class as funnel_events). Inserts happen ONLY inside the
--     claim_vip_code RPC (SECURITY DEFINER): an open INSERT would let anyone
--     write vip_until = 2099 and bypass validation entirely.
--   * claim_vip_code STAYS executable by anon: users claim through it, and
--     codes are unguessable (8..32 chars; auto-generated codes carry 48 bits
--     of entropy). It only validates + consumes codes.
--
-- RPCs:
--   claim_vip_code(p_player text, p_code text) returns timestamptz
--     Serializes per player via pg_advisory_xact_lock, then locks the code
--     row FOR UPDATE; raises vip_code_invalid / vip_code_expired /
--     vip_code_exhausted; increments used; inserts the claim; returns vip_until.
--     Re-claiming the same (player, code) pair raises a unique violation.
--   admin_create_code(p_code, p_max, p_expires, p_note) returns void
--     Normalizes p_code (trim/upper) and enforces 8..32 chars and p_max
--     1..100000 (raises vip_code_length / vip_code_bad_max).
--   admin_list_codes() returns the code inventory for the admin dashboard.

create table if not exists vip_codes (
  code text primary key,
  max_uses int not null default 1,
  used int not null default 0,
  expires_at timestamptz null,
  note text null,
  created_at timestamptz default now()
);

create table if not exists vip_claims (
  player_id text not null,
  code text not null references vip_codes(code),
  vip_until timestamptz not null,
  claimed_at timestamptz default now(),
  primary key (player_id, code)
);

alter table vip_codes enable row level security;
alter table vip_claims enable row level security;
-- vip_codes: intentionally NO policies (deny-all for anon; definer RPCs only).
drop policy if exists vip_claims_select on vip_claims;
create policy vip_claims_select on vip_claims for select using (true);

create index if not exists funnel_events_player_created_idx
  on funnel_events (player_id, created_at desc);

create or replace function claim_vip_code(p_player text, p_code text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_used int;
  v_exp timestamptz;
  v_until timestamptz;
begin
  select max_uses, used, expires_at into v_max, v_used, v_exp
    from vip_codes where code = p_code for update;
  if not found then
    raise exception 'vip_code_invalid';
  end if;
  if v_exp is not null and v_exp <= now() then
    raise exception 'vip_code_expired';
  end if;
  if v_used >= v_max then
    raise exception 'vip_code_exhausted';
  end if;
  update vip_codes set used = used + 1 where code = p_code;
  -- Serialize concurrent claims by the same player so the stacked vip_until
  -- math below can't interleave (the row lock above covers the code row only).
  perform pg_advisory_xact_lock(hashtext(p_player));
  select greatest(now(), coalesce(max(vip_until), now())) + interval '30 days'
    into v_until from vip_claims where player_id = p_player;
  insert into vip_claims(player_id, code, vip_until)
    values (p_player, p_code, v_until);
  return v_until;
end $$;

create or replace function admin_create_code(
  p_code text, p_max int, p_expires timestamptz, p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  -- Normalize inside the RPC so direct callers can't smuggle odd codes past
  -- the route-level validation.
  v_code := upper(trim(p_code));
  if v_code is null or char_length(v_code) < 8 or char_length(v_code) > 32 then
    raise exception 'vip_code_length';
  end if;
  if p_max is null or p_max < 1 or p_max > 100000 then
    raise exception 'vip_code_bad_max';
  end if;
  insert into vip_codes(code, max_uses, expires_at, note)
    values (v_code, p_max, p_expires, p_note);
end $$;

create or replace function admin_list_codes()
returns table (
  code text, max_uses int, used int, expires_at timestamptz,
  note text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select c.code, c.max_uses, c.used, c.expires_at, c.note, c.created_at
    from vip_codes c order by c.created_at desc;
end $$;

-- Admin RPCs are server-only: revoke from every public role (anon and
-- authenticated hold direct default grants on Supabase, and PUBLIC holds the
-- Postgres default — all three must go) and grant only to service_role, which
-- the server uses (lib/supabase/service.ts). claim_vip_code intentionally
-- keeps its PUBLIC execute (users claim through it; see header).
revoke all on function admin_create_code(text, int, timestamptz, text) from anon, authenticated, public;
grant execute on function admin_create_code(text, int, timestamptz, text) to service_role;
revoke all on function admin_list_codes() from anon, authenticated, public;
grant execute on function admin_list_codes() to service_role;

-- DOWN (rollback, never run unless reverting VIP):
-- drop function if exists admin_list_codes();
-- drop function if exists admin_create_code(text, int, timestamptz, text);
-- drop function if exists claim_vip_code(text, text);
-- drop index if exists funnel_events_player_created_idx;
-- drop table if exists vip_claims;
-- drop table if exists vip_codes;

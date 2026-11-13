-- 0020: real accounts (SECURITY PHASE-2a) — auth_links + consents.
-- Run in Supabase SQL editor. These are NEW tables, so deploy order is safe
-- either way (the code degrades gracefully when they are missing: the
-- callback redirects to /login, /api/auth/me reports unlinked). Safe to
-- re-run (IF NOT EXISTS guards throughout).
--
-- Tables:
--   auth_links (auth_user_id uuid PK -> auth.users.id [NOT a DB FK: the
--               delete route removes the link row BEFORE the auth user, and a
--               cross-schema FK would couple user deletion to this table],
--               player_id text UNIQUE: one login per player,
--               role student|parent|teacher)
--   consents   (id uuid PK, parent_auth_user_id uuid, child_player_id text,
--               policy_version default 'v1', UNIQUE(child_player_id): one
--               consent row per child — re-submits upsert idempotently)
-- player ids are text (same anonymous-cookie convention as 0016/0017).
--
-- SECURITY MODEL — DENY-ALL BY DESIGN, READ BEFORE ADDING ANY POLICY:
-- Unlike 0001-0018 (which shipped open anon policies, later revoked by 0019),
-- these tables NEVER get anon/authenticated policies at all: RLS is enabled
-- and NO policy is created, so every direct anon/authenticated query fails
-- closed even before the REVOKEs below belt-and-braces the grants. All access
-- goes through API routes on the service-role client, which resolves identity
-- from the verified Supabase Auth session (auth.getUser on the anon-key auth
-- client in lib/supabase/auth.ts) plus the app-side owner checks in each
-- route. Per-owner JWT policies stay out of scope while cookie players still
-- exist (login is not yet the only identity).
--
-- DOWN (rollback, never run unless reverting real accounts):
-- drop table if exists consents;
-- drop table if exists auth_links;

create table if not exists auth_links (
  auth_user_id uuid primary key,
  player_id text unique not null,
  role text not null check (role in ('student', 'parent', 'teacher')),
  created_at timestamptz default now()
);

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  parent_auth_user_id uuid not null,
  child_player_id text not null,
  policy_version text not null default 'v1',
  created_at timestamptz default now(),
  unique (child_player_id)
);

alter table auth_links enable row level security;
alter table consents enable row level security;

-- NO POLICIES — deny-all by design (see header). The revokes below make the
-- intent explicit so a future stray GRANT still fails closed for public roles.
revoke all on table auth_links from anon, authenticated, public;
revoke all on table consents from anon, authenticated, public;

-- (player_id and child_player_id are already indexed via their UNIQUE
-- constraints; only the parent lookup needs an index.)
create index if not exists consents_parent_idx
  on consents (parent_auth_user_id);

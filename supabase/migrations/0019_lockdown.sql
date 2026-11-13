-- 0019: SECURITY PHASE-1 lockdown — revoke anon/authenticated from every app
-- table except the public plans catalog.
--
-- DEPLOY ORDER (read this or you will break prod):
--   1. Deploy the phase-1 CODE first (lib/supabase/server.ts now uses
--      SUPABASE_SERVICE_ROLE_KEY server-side; clients poll API routes).
--   2. THEN run this SQL in the Supabase SQL editor.
-- Running this SQL first breaks the OLD code, which reads/writes through the
-- anon key. Safe to re-run (IF EXISTS / DO-block guards throughout).
--
-- WHY THIS IS BEHAVIOR-PRESERVING: every anon policy below is fully open
-- (using(true) / with check (true)) and all ownership checks are enforced
-- app-side in the API routes (audited). service_role bypasses RLS, so the
-- new server client is unaffected by the DROPs/REVOKEs. After this lands,
-- the leaked-or-not anon key can do exactly one thing: SELECT the public
-- plans catalog (plans_select is deliberately KEPT).
--
-- ROLLBACK: manual, per table — there is no auto-down. To roll back, re-run
-- the CREATE POLICY statements from the owning migration (0001-0018) for the
-- tables you need, plus GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE <t> TO
-- anon, authenticated (and re-add bosses/raid_hits to supabase_realtime if
-- you restore realtime). Then redeploy the pre-phase-1 code.
--
-- NOTE: this reverses the "do NOT harden by revoking anon" posture comments
-- in 0010/0012/0016/0017/0018 — those were written when the server used the
-- anon key. The server no longer does.

-- 0001: players, scans, bosses, attacks (open_all x4).
drop policy if exists open_all on players;
drop policy if exists open_all on scans;
drop policy if exists open_all on bosses;
drop policy if exists open_all on attacks;
revoke all on table players from anon, authenticated, public;
revoke all on table scans from anon, authenticated, public;
revoke all on table bosses from anon, authenticated, public;
revoke all on table attacks from anon, authenticated, public;

-- 0002: invite_claims (open_all).
drop policy if exists open_all on invite_claims;
revoke all on table invite_claims from anon, authenticated, public;

-- 0003: rush_days (open_all).
drop policy if exists open_all on rush_days;
revoke all on table rush_days from anon, authenticated, public;

-- 0004: raid_hits (open_all).
drop policy if exists open_all on raid_hits;
revoke all on table raid_hits from anon, authenticated, public;

-- 0005: parent_links, market_posts, market_claims (open_all x3).
drop policy if exists open_all on parent_links;
drop policy if exists open_all on market_posts;
drop policy if exists open_all on market_claims;
revoke all on table parent_links from anon, authenticated, public;
revoke all on table market_posts from anon, authenticated, public;
revoke all on table market_claims from anon, authenticated, public;

-- 0006: social tables (open_all x10).
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
revoke all on table player_codes from anon, authenticated, public;
revoke all on table friend_requests from anon, authenticated, public;
revoke all on table friend_blocks from anon, authenticated, public;
revoke all on table direct_messages from anon, authenticated, public;
revoke all on table groups from anon, authenticated, public;
revoke all on table group_members from anon, authenticated, public;
revoke all on table group_messages from anon, authenticated, public;
revoke all on table challenges from anon, authenticated, public;
revoke all on table gifts from anon, authenticated, public;
revoke all on table reports from anon, authenticated, public;

-- 0007: boss_question_cache (open_all).
drop policy if exists open_all on boss_question_cache;
revoke all on table boss_question_cache from anon, authenticated, public;

-- 0008: pvp_sides (open_all).
drop policy if exists open_all on pvp_sides;
revoke all on table pvp_sides from anon, authenticated, public;

-- 0009: exam_duels, exam_elo, exam_rooms, exam_room_players (open_all x4).
drop policy if exists open_all on exam_duels;
drop policy if exists open_all on exam_elo;
drop policy if exists open_all on exam_rooms;
drop policy if exists open_all on exam_room_players;
revoke all on table exam_duels from anon, authenticated, public;
revoke all on table exam_elo from anon, authenticated, public;
revoke all on table exam_rooms from anon, authenticated, public;
revoke all on table exam_room_players from anon, authenticated, public;

-- 0010: exam_attempts (open_all).
drop policy if exists open_all on exam_attempts;
revoke all on table exam_attempts from anon, authenticated, public;

-- 0011: funnel_events (funnel_insert + funnel_select).
drop policy if exists funnel_insert on funnel_events;
drop policy if exists funnel_select on funnel_events;
revoke all on table funnel_events from anon, authenticated, public;

-- 0012: vip_codes (no policies, already deny-all) + vip_claims (vip_claims_select).
revoke all on table vip_codes from anon, authenticated, public;
drop policy if exists vip_claims_select on vip_claims;
revoke all on table vip_claims from anon, authenticated, public;

-- 0013: drill_sets, paper_attempts (insert + select x2).
drop policy if exists drill_sets_insert on drill_sets;
drop policy if exists drill_sets_select on drill_sets;
drop policy if exists paper_attempts_insert on paper_attempts;
drop policy if exists paper_attempts_select on paper_attempts;
revoke all on table drill_sets from anon, authenticated, public;
revoke all on table paper_attempts from anon, authenticated, public;

-- 0015: tutor_threads, tutor_messages (select + insert x2).
drop policy if exists tutor_threads_select on tutor_threads;
drop policy if exists tutor_threads_insert on tutor_threads;
drop policy if exists tutor_messages_select on tutor_messages;
drop policy if exists tutor_messages_insert on tutor_messages;
revoke all on table tutor_threads from anon, authenticated, public;
revoke all on table tutor_messages from anon, authenticated, public;

-- 0016: plans (SELECT KEPT — public catalog), subscriptions, orders,
-- refunds, xu_ledger (all dropped).
-- plans_select intentionally survives: the pricing page reads the catalog.
drop policy if exists subscriptions_select on subscriptions;
drop policy if exists orders_select on orders;
drop policy if exists orders_insert on orders;
drop policy if exists refunds_select on refunds;
drop policy if exists xu_ledger_select on xu_ledger;
revoke all on table subscriptions from anon, authenticated, public;
revoke all on table orders from anon, authenticated, public;
revoke all on table refunds from anon, authenticated, public;
revoke all on table xu_ledger from anon, authenticated, public;

-- 0017: families, family_members (select + insert x2).
drop policy if exists families_select on families;
drop policy if exists families_insert on families;
drop policy if exists family_members_select on family_members;
drop policy if exists family_members_insert on family_members;
revoke all on table families from anon, authenticated, public;
revoke all on table family_members from anon, authenticated, public;

-- 0018: centers, classes, enrollments, assignments (select + insert x4).
drop policy if exists centers_select on centers;
drop policy if exists centers_insert on centers;
drop policy if exists classes_select on classes;
drop policy if exists classes_insert on classes;
drop policy if exists enrollments_select on enrollments;
drop policy if exists enrollments_insert on enrollments;
drop policy if exists assignments_select on assignments;
drop policy if exists assignments_insert on assignments;
revoke all on table centers from anon, authenticated, public;
revoke all on table classes from anon, authenticated, public;
revoke all on table enrollments from anon, authenticated, public;
revoke all on table assignments from anon, authenticated, public;

-- Realtime: no client subscribes anymore (phase-1 converted arena, boss
-- fight, and raid feed to 2s polling), so drop both tables from the default
-- supabase_realtime publication. Guarded: no-op when realtime was never
-- enabled or the tables were never added, and safe to re-run.
do $$
begin
  -- IF EXISTS is not valid syntax inside ALTER PUBLICATION ... DROP TABLE
  -- on this Postgres version, so probe the catalog instead. Safe to re-run.
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and tablename = 'bosses') then
    alter publication supabase_realtime drop table bosses;
  end if;
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and tablename = 'raid_hits') then
    alter publication supabase_realtime drop table raid_hits;
  end if;
exception when undefined_object then
  null;
end $$;

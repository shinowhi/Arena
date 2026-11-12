-- 0014: raid bosses (P4.3 light FOMO): scheduled shared bosses.
-- Run in Supabase SQL editor. Safe to re-run (IF NOT EXISTS).
-- is_raid marks rows spawned by /api/cron/raid (skill_tag, rarity, owner,
-- spawn/despawn, HP, status, questions all reuse the bosses columns).
-- No RLS change: bosses keeps its existing open_all policy posture.
-- The partial index serves GET /api/raids (alive raids by expiry).

alter table bosses add column if not exists is_raid boolean not null default false;

create index if not exists bosses_raid_idx
  on bosses (status, despawn_at) where is_raid;

-- One raid per skill per UTC day: concurrent cron double-fires collide here
-- and the route treats 23505 as "exists" (day expression matches the
-- raidDayNumber epoch-day in lib/raid/raid.ts).
create unique index if not exists bosses_raid_day_uidx
  on bosses (skill_tag, ((spawn_at at time zone 'UTC')::date)) where is_raid;

-- DOWN (rollback, never run unless reverting raid bosses):
-- drop index if exists bosses_raid_day_uidx;
-- drop index if exists bosses_raid_idx;
-- alter table bosses drop column if exists is_raid;

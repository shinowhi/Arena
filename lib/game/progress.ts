// Shared player-progress stats (used by parent report; safe to reuse elsewhere).
// Every query is bounded (<=500 rows) and degrades to zeros on error.
import type { SupabaseClient } from "@supabase/supabase-js";
import { skillName, isValidSkill } from "@/lib/graph/skills";

export interface PlayerStats {
  scans: number;
  rootsPatched: number;
  skillsSlain: number;
  streakDays: number;
  activeDays: number;
  topWeak: { id: string; name: string; misses: number } | null;
}

// UTC day keys, mirroring app/api/streak/route.ts (DB timestamps are UTC ISO).
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function getPlayerStats(
  supabase: SupabaseClient,
  playerId: string,
): Promise<PlayerStats> {
  const zero: PlayerStats = {
    scans: 0,
    rootsPatched: 0,
    skillsSlain: 0,
    streakDays: 0,
    activeDays: 0,
    topWeak: null,
  };
  const { data: scans } = await supabase
    .from("scans")
    .select("weak_skill, created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(500);
  const { data: kills } = await supabase
    .from("attacks")
    .select("created_at, bosses!inner(skill_tag, status)")
    .eq("player_id", playerId)
    .eq("correct", true)
    .eq("bosses.status", "DEAD")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!scans && !kills) return zero;

  const misses = new Map<string, number>();
  for (const s of scans ?? []) {
    const w = (s as { weak_skill?: unknown }).weak_skill;
    if (typeof w === "string" && isValidSkill(w)) misses.set(w, (misses.get(w) ?? 0) + 1);
  }
  const slainSkills = new Set<string>();
  const active = new Set<string>();
  for (const s of scans ?? []) {
    const c = (s as { created_at?: unknown }).created_at;
    if (typeof c === "string") active.add(dayKey(c));
  }
  for (const k of kills ?? []) {
    const row = k as { created_at?: unknown; bosses?: unknown };
    const boss = Array.isArray(row.bosses) ? row.bosses[0] : row.bosses;
    const skill = (boss as { skill_tag?: unknown } | undefined)?.skill_tag;
    if (typeof skill === "string" && isValidSkill(skill)) slainSkills.add(skill);
    if (typeof row.created_at === "string") active.add(dayKey(row.created_at));
  }
  for (const [id] of misses) if (slainSkills.has(id)) misses.delete(id);

  let streak = 0;
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(midnight.getTime());
  if (!active.has(cursor.toISOString().slice(0, 10))) {
    cursor.setTime(cursor.getTime() - 86400000);
  }
  while (active.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - 86400000);
  }

  let top: PlayerStats["topWeak"] = null;
  for (const [id, n] of misses) {
    if (!top || n > top.misses) top = { id, name: skillName(id), misses: n };
  }
  return {
    scans: (scans ?? []).length,
    rootsPatched: 0, // root-cause history is not stored per scan yet; honest zero
    skillsSlain: slainSkills.size,
    streakDays: streak,
    activeDays: active.size,
    topWeak: top,
  };
}

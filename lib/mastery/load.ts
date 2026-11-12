// Shared mastery data loader: aggregates EXISTING tables only (paper_attempts
// + attacks + scans) — no migration, no new tables. Accuracy math needs
// misses too, so attacks are NOT filtered to correct=true (unlike the
// countdown route, which only needs the slain set). Counts only — answers
// and keys never leave the DB through this loader.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidSkill } from "@/lib/graph/skills";
import type { MasteryAttempt, MasteryScan } from "./compute";

type PaperRow = { skill_tag: string; correct: boolean; created_at: string };
type BossJoin = { skill_tag: string; status: string };
type AttackRow = { correct: boolean; created_at: string; bosses: BossJoin | BossJoin[] | null };
type ScanRow = { weak_skill: string; created_at: string };

export type MasteryInput = { attempts: MasteryAttempt[]; scans: MasteryScan[]; slain: string[] };

export async function loadMasteryInput(
  supabase: SupabaseClient,
  playerId: string,
): Promise<MasteryInput> {
  const [{ data: papers }, { data: attacks }, { data: scans }] = await Promise.all([
    supabase
      .from("paper_attempts")
      .select("skill_tag, correct, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("attacks")
      .select("correct, created_at, bosses(skill_tag, status)")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("scans")
      .select("weak_skill, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const attempts: MasteryAttempt[] = [];
  for (const p of ((papers as PaperRow[] | null) ?? [])) {
    if (!isValidSkill(p.skill_tag)) continue;
    attempts.push({ skill_tag: p.skill_tag, correct: p.correct === true, at: p.created_at });
  }
  const slain = new Set<string>();
  for (const a of ((attacks as AttackRow[] | null) ?? [])) {
    const b = Array.isArray(a.bosses) ? a.bosses[0] : a.bosses;
    if (!b || !isValidSkill(b.skill_tag)) continue;
    if (b.status === "DEAD") slain.add(b.skill_tag);
    attempts.push({ skill_tag: b.skill_tag, correct: a.correct === true, at: a.created_at });
  }
  const scanRows: MasteryScan[] = [];
  for (const s of ((scans as ScanRow[] | null) ?? [])) {
    if (!isValidSkill(s.weak_skill)) continue;
    scanRows.push({ weak_skill: s.weak_skill, at: s.created_at });
  }
  return { attempts, scans: scanRows, slain: [...slain] };
}

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/app/api/cron/prime/route";
import { SKILL_IDS } from "@/lib/graph/skills";
import { rushBossHp } from "@/lib/game/boss-rules";
import { createClient } from "@/lib/supabase/server";
import {
  RAID_DAY_MS,
  parseRaidSlot,
  raidDayNumber,
  raidDespawnMs,
  raidSkillFor,
  raidSpawnKey,
  readRaidQuestions,
} from "@/lib/raid/raid";

// Vercel cron spawner: GET /api/cron/raid?slot=N (see vercel.json). Each tick
// forges ONE shared raid boss for the deterministic (slot, day) skill when
// its question set is already cached — empty cache skips (the prime cron
// warms it), an existing raid for today+slot returns exists. Same Bearer
// [REDACTED] as the prime route (shared helper). Responses carry
// status only — questions and keys never leave the server.
export const maxDuration = 60;

export async function GET(req: Request) {
  // Same gate as prime: Vercel sends `Authorization: Bearer <CRON_SECRET>`
  // on cron ticks when CRON_SECRET is set. Anything else is a flat 401.
  if (!isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const t0 = Date.now();
  const slotParam = new URL(req.url).searchParams.get("slot");
  const skill = raidSkillFor(slotParam, raidDayNumber(t0), SKILL_IDS);
  if (!skill) return NextResponse.json({ error: "No skills configured." }, { status: 500 });
  const slot = parseRaidSlot(slotParam);
  const key = raidSpawnKey(slotParam, t0);
  // The skill is a pure function of (slot, day), so "same skill spawned
  // today" is exactly the slot+day idempotency check — no extra column.
  const dayStartIso = new Date(raidDayNumber(t0) * RAID_DAY_MS).toISOString();
  try {
    const supabase = await createClient();
    const existing = await supabase
      .from("bosses")
      .select("id")
      .eq("is_raid", true)
      .eq("skill_tag", skill)
      .gte("spawn_at", dayStartIso)
      .limit(1);
    if (existing.error) {
      return NextResponse.json(
        { error: "Raid is not set up yet — run migration 0014." },
        { status: 503 },
      );
    }
    if ((existing.data ?? []).length > 0) {
      return NextResponse.json({ ok: true, skill, slot, key, action: "exists", ms: Date.now() - t0 });
    }
    const questions = await readRaidQuestions(supabase, skill);
    if (!questions) {
      return NextResponse.json({ ok: true, skill, slot, key, action: "skipped", ms: Date.now() - t0 });
    }
    // Shared ownerless raid (tougher than the world boss): ELITE is the top
    // mid-tier the boss_rarity enum offers — there is no RARE value.
    const hp = rushBossHp();
    const ins = await supabase.from("bosses").insert({
      skill_tag: skill,
      rarity: "ELITE",
      owner_player_id: null,
      despawn_at: new Date(raidDespawnMs(t0)).toISOString(),
      max_hp: hp,
      current_hp: hp,
      status: "ALIVE",
      questions,
      is_raid: true,
    });
    if (ins.error) {
      // Lost a cron double-fire race (bosses_raid_day_uidx): the twin row is
      // this slot's raid, so report exists instead of failing.
      if ((ins.error as { code?: string }).code === "23505") {
        return NextResponse.json({ ok: true, skill, slot, key, action: "exists", ms: Date.now() - t0 });
      }
      throw new Error("Raid insert failed.");
    }
    return NextResponse.json({ ok: true, skill, slot, key, action: "created", ms: Date.now() - t0 });
  } catch {
    return NextResponse.json({ error: "Raid spawn failed — retry." }, { status: 500 });
  }
}

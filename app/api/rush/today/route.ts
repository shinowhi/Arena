import { NextResponse } from "next/server";
import { generateBossQuestions } from "@/lib/agents/boss-generator";
import { createClient } from "@/lib/supabase/server";
import { rushBossHp } from "@/lib/game/boss-rules";
import { rushDayIndex, rushSkill, rushDayString, rushResetAt } from "@/lib/game/rush";

type BossRow = {
  id: string;
  skill_tag: string;
  rarity: string;
  spawn_at: string;
  despawn_at: string;
  max_hp: number;
  current_hp: number;
  status: string;
};

function pub(b: BossRow) {
  return {
    id: b.id,
    skill_tag: b.skill_tag,
    rarity: b.rarity,
    spawn_at: b.spawn_at,
    despawn_at: b.despawn_at,
    max_hp: b.max_hp,
    current_hp: b.current_hp,
    status: b.status,
  };
}

export async function GET() {
  const supabase = await createClient();
  // SECURITY PHASE-1: public daily boss — never mints a player (the old
  // call's result was unused).
  const nowMs = Date.now();
  const day = rushDayString(nowMs);
  const idx = rushDayIndex(nowMs);
  const skill = rushSkill(idx);
  await supabase.from("bosses").update({ status: "EXPIRED" }).eq("status", "ALIVE").lt("despawn_at", new Date(nowMs).toISOString());
  const { data: existing, error: rushErr } = await supabase
    .from("rush_days")
    .select("boss_id, bosses(*)")
    .eq("day", day)
    .maybeSingle();
  if (rushErr) return NextResponse.json({ error: "Daily Rush unlocks after migration 0003." }, { status: 503 });
  const boss = (existing as { bosses: BossRow | null } | null)?.bosses ?? null;
  if (boss && boss.status === "ALIVE" && new Date(boss.despawn_at).getTime() > nowMs) {
    return NextResponse.json({ day, seed: String(idx), reset_at: rushResetAt(nowMs), boss: pub(boss) });
  }
  try {
    const gen = await generateBossQuestions(skill);
    const hp = rushBossHp();
    const { data: row } = await supabase
      .from("bosses")
      .insert({
        skill_tag: skill,
        rarity: "ELITE",
        owner_player_id: null,
        despawn_at: rushResetAt(nowMs),
        max_hp: hp,
        current_hp: hp,
        questions: gen.questions,
      })
      .select("*")
      .single();
    if (!row) throw new Error("Could not save rush boss.");
    const { error: upErr } = await supabase
      .from("rush_days")
      .upsert({ day, boss_id: (row as BossRow).id, seed: String(idx) }, { onConflict: "day" });
    if (upErr) throw upErr;
    return NextResponse.json({ day, seed: String(idx), reset_at: rushResetAt(nowMs), boss: pub(row as BossRow) });
  } catch (e) {
    console.error("rush spawn failed:", e);
    return NextResponse.json({ error: "Could not summon today's rush boss." }, { status: 503 });
  }
}
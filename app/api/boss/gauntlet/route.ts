import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { PRIVATE_BOSS_HP, bossTtlSeconds } from "@/lib/game/boss-rules";
import { getBossQuestionsCached } from "@/lib/game/boss-cache";
import { isValidSkill, skillName, SKILL_IDS } from "@/lib/graph/skills";
import { buildGauntletQuestions, GauntletSkills, pickGauntletSkills } from "@/lib/agents/gauntlet";

// skill_tag stored for gauntlet bosses. The fight page special-cases it.
export const GAUNTLET_TAG = "gauntlet";

async function resolveSkills(playerId: string): Promise<string[]> {
  const supabase = await createClient();
  const [scansRes, cacheRes] = await Promise.all([
    supabase.from("scans").select("weak_skill").eq("player_id", playerId).order("created_at", { ascending: false }).limit(50),
    supabase.from("boss_question_cache").select("skill_tag").eq("set_version", 1).order("fetched_at", { ascending: false }).limit(50),
  ]);
  const freq = new Map<string, number>();
  for (const r of ((scansRes.data ?? []) as Array<{ weak_skill: string | null }>)) {
    if (r.weak_skill && isValidSkill(r.weak_skill)) freq.set(r.weak_skill, (freq.get(r.weak_skill) ?? 0) + 1);
  }
  const playerSkills = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const cached = ((cacheRes.data ?? []) as Array<{ skill_tag: string }>).map((r) => r.skill_tag).filter(isValidSkill);
  return pickGauntletSkills(playerSkills, cached, SKILL_IDS);
}

export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const skills = await resolveSkills(playerId);
    if (skills.length < 5) return NextResponse.json({ error: "Not enough skills to build a gauntlet." }, { status: 422 });
    const parsed = GauntletSkills.parse({ skills });
    return NextResponse.json({ skills: parsed.skills, names: parsed.skills.map(skillName) });
  } catch {
    return NextResponse.json({ error: "Gauntlet lookup failed — retry." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const playerId = await getOrCreatePlayerId();
    const skills = await resolveSkills(playerId);
    if (skills.length < 5) return NextResponse.json({ error: "Not enough skills to build a gauntlet." }, { status: 422 });
    // Cached sets serve instantly; a miss forges that skill (and warms the cache).
    const sets = await Promise.all(skills.map((s) => getBossQuestionsCached(s).then((r) => r.questions)));
    const questions = buildGauntletQuestions(sets);
    if (questions.length < 5) return NextResponse.json({ error: "Gauntlet forge failed — retry." }, { status: 422 });
    const supabase = await createClient();
    const ttl = bossTtlSeconds();
    const { data, error } = await supabase
      .from("bosses")
      .insert({
        skill_tag: GAUNTLET_TAG,
        rarity: "ELITE",
        owner_player_id: playerId,
        despawn_at: new Date(Date.now() + ttl * 1000).toISOString(),
        max_hp: PRIVATE_BOSS_HP,
        current_hp: PRIVATE_BOSS_HP,
        questions,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not save gauntlet — retry." }, { status: 500 });
    const out = z.object({ boss_id: z.string().min(1), skills: z.array(z.string()).length(5) });
    return NextResponse.json(out.parse({ boss_id: (data as { id: string }).id, skills }));
  } catch (err) {
    console.error("gauntlet failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gauntlet forge failed — retry." }, { status: 422 });
  }
}

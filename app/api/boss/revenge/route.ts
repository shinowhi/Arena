import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { PRIVATE_BOSS_HP, bossTtlSeconds } from "@/lib/game/boss-rules";
import { MetaLLMError } from "@/lib/llm/meta";
import { isValidSkill, skillName } from "@/lib/graph/skills";
import { collectAvoidPrompts, generateRevengeQuestions, pickRevengeTarget } from "@/lib/agents/revenge";

const TargetOut = z.object({
  target: z
    .object({ skill_tag: z.string(), skill_name: z.string(), wrong_count: z.number().int().positive() })
    .nullable(),
});

async function findTarget(playerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attacks")
    .select("created_at, bosses!inner(skill_tag)")
    .eq("player_id", playerId)
    .eq("correct", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return null;
  const wrongs = (data as Array<{ created_at: string; bosses: { skill_tag: string } | Array<{ skill_tag: string }> }>)
    .map((r) => ({
      created_at: r.created_at,
      skill_tag: Array.isArray(r.bosses) ? (r.bosses[0]?.skill_tag ?? "") : (r.bosses?.skill_tag ?? ""),
    }))
    .filter((w) => isValidSkill(w.skill_tag));
  const picked = pickRevengeTarget(wrongs);
  if (!picked) return null;
  return { skill_tag: picked.skill_tag, skill_name: skillName(picked.skill_tag), wrong_count: picked.wrong_count };
}

export async function GET() {
  const playerId = await getOrCreatePlayerId();
  const target = await findTarget(playerId);
  return NextResponse.json(TargetOut.parse({ target }));
}

export async function POST() {
  try {
    const playerId = await getOrCreatePlayerId();
    const target = await findTarget(playerId);
    if (!target) return NextResponse.json({ error: "No misses yet — fight a boss first." }, { status: 404 });
    const supabase = await createClient();
    const { data: recent } = await supabase
      .from("bosses")
      .select("questions")
      .eq("owner_player_id", playerId)
      .eq("skill_tag", target.skill_tag)
      .order("spawn_at", { ascending: false })
      .limit(3);
    const avoid = collectAvoidPrompts(
      ((recent ?? []) as Array<{ questions: Array<{ prompt_latex?: string }> }>),
    );
    const questions = await generateRevengeQuestions(target.skill_tag, avoid);
    const ttl = bossTtlSeconds();
    const { data, error } = await supabase
      .from("bosses")
      .insert({
        skill_tag: target.skill_tag,
        rarity: "ELITE",
        owner_player_id: playerId,
        despawn_at: new Date(Date.now() + ttl * 1000).toISOString(),
        max_hp: PRIVATE_BOSS_HP,
        current_hp: PRIVATE_BOSS_HP,
        questions,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not save revenge boss.");
    return NextResponse.json({
      boss_id: (data as { id: string }).id,
      skill_tag: target.skill_tag,
      wrong_count: target.wrong_count,
      avoided: avoid.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Revenge summon failed.";
    const isSkill = err instanceof MetaLLMError && msg.startsWith("Invalid skill_tag");
    return NextResponse.json({ error: msg }, { status: isSkill ? 400 : 422 });
  }
}

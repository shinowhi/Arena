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

type Target = { skill_tag: string; skill_name: string; wrong_count: number };

async function findTarget(playerId: string): Promise<{ target: Target | null; dbError: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attacks")
    .select("created_at, bosses!inner(skill_tag)")
    .eq("player_id", playerId)
    .eq("correct", false)
    .order("created_at", { ascending: false })
    .limit(100);
  // DB outage must surface as 500, never masquerade as "no misses".
  if (error || !data) return { target: null, dbError: true };
  const wrongs = (data as Array<{ created_at: string; bosses: { skill_tag: string } | Array<{ skill_tag: string }> }>)
    .map((r) => ({
      created_at: r.created_at,
      skill_tag: Array.isArray(r.bosses) ? (r.bosses[0]?.skill_tag ?? "") : (r.bosses?.skill_tag ?? ""),
    }))
    .filter((w) => isValidSkill(w.skill_tag));
  const picked = pickRevengeTarget(wrongs);
  if (!picked) return { target: null, dbError: false };
  return {
    target: { skill_tag: picked.skill_tag, skill_name: skillName(picked.skill_tag), wrong_count: picked.wrong_count },
    dbError: false,
  };
}

export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const { target, dbError } = await findTarget(playerId);
    if (dbError) return NextResponse.json({ error: "Revenge lookup failed — retry." }, { status: 500 });
    return NextResponse.json(TargetOut.parse({ target }));
  } catch {
    return NextResponse.json({ error: "Revenge lookup failed — retry." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const playerId = await getOrCreatePlayerId();
    const { target, dbError } = await findTarget(playerId);
    if (dbError) return NextResponse.json({ error: "Revenge lookup failed — retry." }, { status: 500 });
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
    if (error || !data) return NextResponse.json({ error: "Could not save revenge boss — retry." }, { status: 500 });
    return NextResponse.json({
      boss_id: (data as { id: string }).id,
      skill_tag: target.skill_tag,
      wrong_count: target.wrong_count,
      avoided: avoid.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Revenge summon failed.";
    // Defense-in-depth only: findTarget pre-filters by isValidSkill.
    const isSkill = err instanceof MetaLLMError && msg.startsWith("Invalid skill_tag");
    if (isSkill) return NextResponse.json({ error: msg }, { status: 400 });
    // Never leak provider internals (keys, upstream bodies) to the client.
    console.error("revenge forge failed:", msg);
    return NextResponse.json({ error: "Revenge forge failed — retry." }, { status: 422 });
  }
}

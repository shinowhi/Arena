import { NextResponse } from "next/server";
import { z } from "zod";
import { getBossQuestionsCached } from "@/lib/game/boss-cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { PRIVATE_BOSS_HP, bossTtlSeconds } from "@/lib/game/boss-rules";
import { MetaLLMError } from "@/lib/llm/meta";

const Body = z.object({ skill_tag: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing skill_tag." }, { status: 400 });
  try {
    // Player lookup and question fetch are independent: overlap them.
    // Cached sets are ownerless templates; the insert below clones them into
    // a fresh boss row owned by this viewer.
    const [playerId, boss] = await Promise.all([
      getOrCreatePlayerId(),
      getBossQuestionsCached(parsed.data.skill_tag),
    ]);
    const supabase = await createClient();
    const ttl = bossTtlSeconds();
    const { data, error } = await supabase
      .from("bosses")
      .insert({
        skill_tag: parsed.data.skill_tag,
        owner_player_id: playerId,
        despawn_at: new Date(Date.now() + ttl * 1000).toISOString(),
        max_hp: PRIVATE_BOSS_HP,
        current_hp: PRIVATE_BOSS_HP,
        questions: boss.questions,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not save boss.");
    return NextResponse.json({ boss_id: (data as { id: string }).id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Summon failed.";
    const isSkill = err instanceof MetaLLMError && msg.startsWith("Invalid skill_tag");
    return NextResponse.json({ error: msg }, { status: isSkill ? 400 : 422 });
  }
}

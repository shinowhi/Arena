import { NextResponse } from "next/server";
import { z } from "zod";
import { getBossQuestionsCached } from "@/lib/game/boss-cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { PRIVATE_BOSS_HP, bossTtlSeconds } from "@/lib/game/boss-rules";
import { isValidSkill } from "@/lib/graph/skills";
import { MetaLLMError } from "@/lib/llm/meta";

const Body = z.object({ skill_tag: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isValidSkill(parsed.data.skill_tag)) {
    return NextResponse.json({ error: "Missing or invalid skill_tag." }, { status: 400 });
  }
  try {
    const [playerId, boss] = await Promise.all([
      getOrCreatePlayerId(),
      getBossQuestionsCached(parsed.data.skill_tag),
    ]);
    const supabase = await createClient();
    const ttl = bossTtlSeconds();
    const { data, error } = await supabase
      .from("bosses")
      .insert({
        skill_tag: `pvp:${parsed.data.skill_tag}`,
        rarity: "ELITE",
        owner_player_id: playerId,
        despawn_at: new Date(Date.now() + ttl * 1000).toISOString(),
        max_hp: PRIVATE_BOSS_HP,
        current_hp: PRIVATE_BOSS_HP,
        questions: boss.questions,
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "Could not create room — retry." }, { status: 500 });
    // Creator auto-claims side A; a missing pvp_sides table means 0008 isn't run yet.
    const { error: claimErr } = await supabase
      .from("pvp_sides")
      .insert({ room_id: (data as { id: string }).id, player_id: playerId, side: "A" });
    if (claimErr) {
      if ((claimErr as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "PVP unlocks after migration 0008." }, { status: 503 });
      }
      return NextResponse.json({ error: "Could not create room — retry." }, { status: 500 });
    }
    return NextResponse.json({ room_id: (data as { id: string }).id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Room creation failed.";
    const isSkill = err instanceof MetaLLMError && msg.startsWith("Invalid skill_tag");
    if (isSkill) return NextResponse.json({ error: msg }, { status: 400 });
    console.error("pvp room failed:", msg);
    return NextResponse.json({ error: "Room creation failed — retry." }, { status: 422 });
  }
}

import { NextResponse } from "next/server";
import { generateTaunt, type TauntMood } from "@/lib/agents/taunt";
import { createClient } from "@/lib/supabase/server";
import { skillName } from "@/lib/graph/skills";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Best-effort flavor cache: one taunt per boss per HP quarter per mood.
// Module-level Map survives warm invocations; cold starts regenerate.
const cache = new Map<string, string>();

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  // IP-only bucket (no player identity on this route); cache hits are cheap
  // but uncached calls hit the LLM, so gate before the DB read.
  const ipRl = checkRate(`taunt:ip:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bosses")
      .select("skill_tag, rarity, current_hp, max_hp, status")
      .eq("id", id)
      .single();
    if (error || !data) return NextResponse.json({ error: "Boss not found." }, { status: 404 });
    const b = data as { skill_tag: string; rarity: string; current_hp: number; max_hp: number; status: string };
    const pct = b.max_hp > 0 ? Math.max(0, Math.round((b.current_hp / b.max_hp) * 100)) : 0;
    const mood: TauntMood = b.status !== "ALIVE" ? "slain" : pct <= 50 ? "wounded" : "greet";
    const key = `${id}:${mood}:${Math.floor(pct / 25)}`;
    const hit = cache.get(key);
    if (hit) return NextResponse.json({ taunt: hit, cached: true });
    const taunt = await generateTaunt({ skill_name: skillName(b.skill_tag), rarity: b.rarity, hpPct: pct, mood });
    cache.set(key, taunt);
    return NextResponse.json({ taunt, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Taunt failed." },
      { status: 422 },
    );
  }
}

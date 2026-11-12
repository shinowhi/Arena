import { NextResponse } from "next/server";
import { generateBossQuestions } from "@/lib/agents/boss-generator";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { worldBossHp, bossTtlSeconds } from "@/lib/game/boss-rules";

// Seed fallback when <24h of scan data exists.
const SEED_SKILLS = ["chain_rule", "integration_by_parts", "lhopital_rule"];

type BossRow = {
  id: string;
  skill_tag: string;
  rarity: string;
  owner_player_id: string | null;
  spawn_at: string;
  despawn_at: string;
  max_hp: number;
  current_hp: number;
  status: string;
};

// Vercel Hobby kills functions at 60s; never let one Meta-API blip hang
// every arena visitor. On timeout the existing catch below returns the
// list without a world boss (fail-soft, retried on next visit).
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("World boss spawn timed out.")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function pub(b: BossRow) {
  return {
    id: b.id,
    skill_tag: b.skill_tag,
    rarity: b.rarity,
    is_world: b.owner_player_id === null,
    spawn_at: b.spawn_at,
    despawn_at: b.despawn_at,
    max_hp: b.max_hp,
    current_hp: b.current_hp,
    status: b.status,
  };
}

export async function GET() {
  const supabase = await createClient();
  const playerId = await getOrCreatePlayerId();
  const now = new Date().toISOString();
  // Lazy expiry (no cron).
  await supabase.from("bosses").update({ status: "EXPIRED" }).eq("status", "ALIVE").lt("despawn_at", now);
  const { data } = await supabase
    .from("bosses")
    .select("*")
    .eq("status", "ALIVE")
    .gt("despawn_at", now)
    .order("spawn_at", { ascending: false });
  // Only the shared World Boss plus your own: other players' bosses would 403 on open.
  const alive = ((data ?? []) as BossRow[]).filter((b) => b.owner_player_id === playerId);
  // Raid bosses (P4.3) are ownerless but must not claim the world slot:
  // pre-migration the column is absent (undefined !== true → kept), so this
  // filter is a no-op until 0014 lands. (One-time B touch in A's file — see
  // agent-exchange.md; revert or restyle freely.)
  const nonRaid = ((data ?? []) as (BossRow & { is_raid?: boolean })[]).filter((b) => b.is_raid !== true);
  let world = (nonRaid as BossRow[]).find((b) => b.owner_player_id === null) ?? null;

  // Lazy World Boss spawn: none alive -> create one.
  if (!world) {
    let skill = SEED_SKILLS[new Date().getHours() % SEED_SKILLS.length];
    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: scans } = await supabase.from("scans").select("weak_skill").gt("created_at", since);
      const freq = new Map<string, number>();
      for (const s of (scans ?? []) as Array<{ weak_skill: string | null }>) {
        if (s.weak_skill) freq.set(s.weak_skill, (freq.get(s.weak_skill) ?? 0) + 1);
      }
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) skill = top[0];
      const boss = await withTimeout(generateBossQuestions(skill), 50000);
      const ttl = bossTtlSeconds();
      const hp = worldBossHp();
      const { data: row } = await supabase
        .from("bosses")
        .insert({
          skill_tag: skill,
          rarity: "LEGENDARY",
          owner_player_id: null,
          despawn_at: new Date(Date.now() + ttl * 1000).toISOString(),
          max_hp: hp,
          current_hp: hp,
          questions: boss.questions,
        })
        .select("*")
        .single();
      if (row) world = row as BossRow;
    } catch (e) {
      console.error("world boss spawn failed:", e);
    }
  }
  return NextResponse.json({ bosses: [...(world ? [pub(world)] : []), ...alive.map(pub)] });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";

// GET /api/boss/[id]/raid-hits — recent hits on a shared boss for the raid
// feed. SECURITY PHASE-1: replaces RaidFeed's direct anon read of raid_hits
// (revoked in migration 0019). Public data (damage + display names only),
// newest first, max 15. Never mints a player: spectators can watch.
// Ownership mirrors boss/[id]: private bosses 403 non-owners (null identity
// included); ownerless/world bosses stay open.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Bad boss id." }, { status: 400 });
  }
  try {
    const supabase = await createClient();
    const boss = await supabase.from("bosses").select("owner_player_id").eq("id", id).single();
    const owner = (boss.data as { owner_player_id: string | null } | null)?.owner_player_id ?? null;
    if (owner !== null) {
      const me = await getPlayerId().catch(() => null);
      if (me !== owner) return NextResponse.json({ error: "Not your boss." }, { status: 403 });
    }
    const { data, error } = await supabase
      .from("raid_hits")
      .select("damage, created_at, player_id")
      .eq("boss_id", id)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) {
      if ((error as { code?: string }).code === "42P01") {
        return NextResponse.json({ error: "Raid feed unlocks after migration 0004.", needsMigration: true }, { status: 503 });
      }
      throw error;
    }
    const rows = (data ?? []) as Array<{ damage: number; created_at: string; player_id: string }>;
    const ids = [...new Set(rows.map((r) => r.player_id))];
    const { data: players } = ids.length
      ? await supabase.from("players").select("id, display_name").in("id", ids)
      : { data: [] as Array<{ id: string; display_name: string | null }> };
    const names = new Map(
      ((players ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name]),
    );
    return NextResponse.json({
      hits: rows.map((r) => ({
        damage: r.damage,
        created_at: r.created_at,
        player_id: r.player_id,
        players: { display_name: names.get(r.player_id) ?? null },
      })),
    });
  } catch {
    return NextResponse.json({ error: "Could not load raid feed." }, { status: 500 });
  }
}

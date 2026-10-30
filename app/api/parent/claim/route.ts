// POST /api/parent/claim — parent device: claim a child's link code.
// Body: { code }. Claimer identity comes from the arena_player_id cookie.
// Friendly plain errors, no stack traces.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";

const Body = z.object({ code: z.string().trim().min(4).max(12) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A link code is required." }, { status: 400 });
  const code = parsed.data.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  try {
    const parentId = await getOrCreatePlayerId();
    const db = await createClient();
    const { data, error } = await db
      .from("parent_links")
      .select("code, child_id, parent_id")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "That code does not exist. Check it and try again." }, { status: 404 });
    const link = data as { child_id: string; parent_id: string | null };
    if (link.parent_id) return NextResponse.json({ error: "This code was already used." }, { status: 409 });
    if (link.child_id === parentId) {
      return NextResponse.json({ error: "That is your own code — enter it on a parent device." }, { status: 400 });
    }
    // Guard the check-then-set race: only an unclaimed code can be claimed.
    const { data: claimed, error: upErr } = await db
      .from("parent_links")
      .update({ parent_id: parentId })
      .eq("code", code)
      .is("parent_id", null)
      .select("code");
    if (upErr) throw upErr;
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: "This code was already used." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Parent linking needs a database update (migration 0005).", needsMigration: true },
      { status: 503 },
    );
  }
}

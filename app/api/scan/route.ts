import { NextResponse } from "next/server";
import { decomposeImage } from "@/lib/agents/vision-decomposer";
import { findGap } from "@/lib/agents/gap-finder";
import { MetaLLMError } from "@/lib/llm/meta";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  let imageDataUrl: string;
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing image file." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 5MB)." }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    imageDataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  } catch {
    return NextResponse.json({ error: "Could not read upload." }, { status: 400 });
  }
  try {
    // Player lookup overlaps the LLM chain (independent); the decompose ->
    // gap chain stays sequential (dependent). The settled wrapper attaches a
    // handler NOW so a fast DB failure can't surface as an unhandled
    // rejection while the LLM calls run. DB save stays best-effort.
    const playerSettled = getOrCreatePlayerId().then<string | null, string | null>(
      (id) => id,
      () => null,
    );
    const decomp = await decomposeImage(imageDataUrl);
    const gap = await findGap(decomp);
    try {
      const playerId = await playerSettled;
      if (!playerId) throw new Error("player lookup failed");
      const supabase = await createClient();
      await supabase.from("scans").insert({
        player_id: playerId,
        questions: decomp.items,
        weak_skill: gap.weak_skill,
        root_cause: gap.root_cause,
        confidence: gap.confidence,
      });
    } catch (dbErr) {
      console.error("scan save failed (diagnosis still returned):", dbErr);
    }
    return NextResponse.json({ ...decomp, ...gap, can_summon: gap.confidence >= 0.3 });
  } catch (err) {
    const raw = err instanceof MetaLLMError ? err.message : "Analysis failed.";
    const msg = /schema|valid|json|parse|empty|no problem/i.test(raw)
      ? "No solvable problems found. Take a photo of worked exercises (not theory notes)."
      : raw;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}

import { NextResponse } from "next/server";
import { photoToProblem } from "@/lib/agents/photo-problem";
import { generateBossQuestions } from "@/lib/agents/boss-generator";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { PRIVATE_BOSS_HP, bossTtlSeconds } from "@/lib/game/boss-rules";
import { MetaLLMError } from "@/lib/llm/meta";

const MAX_BYTES = 5 * 1024 * 1024;

// Real-life scan mode: photo -> 1 verified problem -> private boss whose level-1
// question IS the photo problem (other 4 generated isomorphic). Answers never
// leave the server: the client only sees problem_latex + boss_id.
export async function POST(req: Request) {
  let file: File | null = null;
  try {
    file = (await req.formData()).get("image") as File | null;
  } catch {
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }
  if (!file || typeof file === "string") return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 5MB)." }, { status: 400 });
  const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  try {
    const photo = await photoToProblem(dataUrl);
    const generated = await generateBossQuestions(photo.skill_tag);
    const questions = [
      {
        level: 1,
        prompt_latex: photo.problem_latex,
        answer_numeric: photo.answer_numeric,
        tolerance: photo.tolerance,
        hint: photo.hint,
      },
      ...generated.questions.slice(1, 5).map((q) => ({
        level: q.level,
        prompt_latex: q.prompt_latex,
        answer_numeric: q.answer_numeric,
        tolerance: q.tolerance,
        hint: q.hint,
      })),
    ];
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const ttl = bossTtlSeconds();
    const { data, error } = await supabase
      .from("bosses")
      .insert({
        skill_tag: photo.skill_tag,
        owner_player_id: playerId,
        despawn_at: new Date(Date.now() + ttl * 1000).toISOString(),
        max_hp: PRIVATE_BOSS_HP,
        current_hp: PRIVATE_BOSS_HP,
        questions,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not save boss.");
    return NextResponse.json({
      boss_id: (data as { id: string }).id,
      skill_tag: photo.skill_tag,
      problem_latex: photo.problem_latex,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Photo scan failed.";
    const bad = err instanceof MetaLLMError;
    return NextResponse.json({ error: msg }, { status: bad ? 422 : 500 });
  }
}

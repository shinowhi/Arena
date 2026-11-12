import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { generatePaper } from "@/lib/agents/paper-generator";
import { BossQuestion } from "@/lib/agents/boss-generator";
import { getBossQuestionsCached } from "@/lib/game/boss-cache";
import { photoToProblem } from "@/lib/agents/photo-problem";
import { isValidSkill, skillName } from "@/lib/graph/skills";
import { isVip } from "@/lib/vip";
import { MetaLLMError } from "@/lib/llm/meta";
import { clampCount, DrillPaper, type DrillQuestion } from "@/lib/drill/paper";

const Body = z.object({
  source: z.enum(["weak", "misses", "topic", "upload"]),
  topic: z.string().min(1).optional(),
  image: z.string().min(1).optional(),
  count: z.number().int().optional(),
});

// Data-URL cap (~5MB of binary as base64); the Vercel body cap trips first.
const MAX_IMAGE_CHARS = 7_000_000;

type ScanRow = { weak_skill: string };
type AttackRow = {
  bosses: { skill_tag: string; status: string } | Array<{ skill_tag: string; status: string }> | null;
};
type MissRow = {
  boss_id: string;
  question_index: number;
  bosses: { skill_tag: string; questions: unknown } | Array<{ skill_tag: string; questions: unknown }>;
};

// Assemble a keyed server-side paper per source; throws friendly Errors and
// MetaLLMError (mapped to 422 below). All LLM flows through lib/llm/meta.ts.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing or invalid drill source." }, { status: 400 });
  const { source, topic, image } = parsed.data;
  // Topic/upload forges are LLM-bound: >10 triggers a second forge (4
  // sequential batches worst-case) and risks the 60s function cap, so cap
  // forged sources at 10. Cache-backed sources (weak/misses) keep 20.
  const count =
    source === "topic" || source === "upload"
      ? Math.min(clampCount(parsed.data.count), 10)
      : clampCount(parsed.data.count);
  if (source === "topic" && (!topic || !isValidSkill(topic))) {
    return NextResponse.json({ error: "Unknown topic skill — pick one from the list." }, { status: 400 });
  }
  if (
    source === "upload" &&
    (!image || !image.startsWith("data:image/") || image.length > MAX_IMAGE_CHARS)
  ) {
    return NextResponse.json({ error: "Missing or invalid image data URL." }, { status: 400 });
  }
  // 20/min per player-or-IP. Read-only identity: the 429 path mints nothing.
  const gateId = await getPlayerId().catch(() => null);
  const rl = checkRate(`drill:${gateId ?? getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  // Upload drills are VIP-only, gated BEFORE any LLM (same 402 shape as
  // photo-problem). Unknown players fail closed without minting a row.
  if (source === "upload") {
    const vip = gateId ? await isVip(await createClient(), gateId) : false;
    if (!vip) {
      return NextResponse.json(
        {
          error: "Photo drills are a VIP feature. Enter a VIP code to unlock them.",
          vip_url: "/vip",
        },
        { status: 402 },
      );
    }
  }
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    let title = "";
    let questions: DrillQuestion[] = [];
    if (source === "topic") {
      const skill = topic as string;
      const first = await generatePaper(skill);
      questions = first.questions.slice(0, count).map((q) => ({ ...q, skill_tag: skill }));
      if (questions.length < count) {
        const second = await generatePaper(skill);
        questions.push(
          ...second.questions.slice(0, count - questions.length).map((q) => ({ ...q, skill_tag: skill })),
        );
      }
      title = `${skillName(skill)} drill`;
    } else if (source === "weak") {
      // Countdown pattern: scan weak_skill counts minus slain skills.
      const [{ data: scans }, { data: attacks }] = await Promise.all([
        supabase.from("scans").select("weak_skill").eq("player_id", playerId).limit(1000),
        supabase
          .from("attacks")
          .select("bosses(skill_tag, status)")
          .eq("player_id", playerId)
          .eq("correct", true)
          .limit(2000),
      ]);
      const misses = new Map<string, number>();
      for (const s of ((scans as ScanRow[] | null) ?? [])) {
        if (!isValidSkill(s.weak_skill)) continue;
        misses.set(s.weak_skill, (misses.get(s.weak_skill) ?? 0) + 1);
      }
      const slain = new Set<string>();
      for (const a of ((attacks as AttackRow[] | null) ?? [])) {
        const b = Array.isArray(a.bosses) ? a.bosses[0] : a.bosses;
        if (b?.status === "DEAD" && b.skill_tag) slain.add(b.skill_tag);
      }
      const weak = [...misses.entries()]
        .filter(([tag]) => !slain.has(tag))
        .sort((x, y) => y[1] - x[1])
        .map(([tag]) => tag);
      if (weak.length === 0) {
        return NextResponse.json(
          { error: "No open weak skills — everything scanned is healed. Try a topic drill." },
          { status: 422 },
        );
      }
      const top = weak.slice(0, 4);
      const sets = await Promise.all(top.map((s) => getBossQuestionsCached(s)));
      for (let i = 0; i < 5 && questions.length < count; i++) {
        for (let k = 0; k < sets.length && questions.length < count; k++) {
          const q = sets[k].questions[i];
          if (q) questions.push({ ...q, skill_tag: top[k] });
        }
      }
      title = "Weak-skills drill";
    } else if (source === "misses") {
      // Misses engine shape, adapted server-side: the stored bosses rows
      // still hold answer_numeric, so re-parse the FULL question (keys in).
      const { data, error } = await supabase
        .from("attacks")
        .select("boss_id, question_index, bosses!inner(skill_tag, questions)")
        .eq("player_id", playerId)
        .eq("correct", false)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error || !data) {
        return NextResponse.json({ error: "Miss queue failed — retry." }, { status: 500 });
      }
      const seen = new Set<string>();
      for (const r of data as MissRow[]) {
        if (questions.length >= count) break;
        const key = `${r.boss_id}:${r.question_index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const b = Array.isArray(r.bosses) ? r.bosses[0] : r.bosses;
        const skill_tag = b?.skill_tag ?? "";
        if (!isValidSkill(skill_tag)) continue;
        const raw = Array.isArray(b?.questions) ? b.questions[r.question_index] : undefined;
        const q = BossQuestion.safeParse(raw);
        if (q.success) questions.push({ ...q.data, skill_tag });
      }
      if (questions.length === 0) {
        return NextResponse.json({ error: "No misses yet — fight a boss first." }, { status: 422 });
      }
      title = "Miss-queue drill";
    } else {
      // Photo pipeline: the photo problem IS question 1 (as in
      // photo-problem), the cached set fills the rest, paper-generator tops
      // up when the caller asked for more than the cache holds.
      const photo = await photoToProblem(image as string);
      const cached = await getBossQuestionsCached(photo.skill_tag);
      questions = [
        {
          level: 1,
          prompt_latex: photo.problem_latex,
          answer_numeric: photo.answer_numeric,
          tolerance: photo.tolerance,
          hint: photo.hint,
          check: photo.check,
          skill_tag: photo.skill_tag,
        },
        ...cached.questions.slice(1, count).map((q) => ({ ...q, skill_tag: photo.skill_tag })),
      ].slice(0, count);
      while (questions.length < count) {
        const extra = await generatePaper(photo.skill_tag);
        questions.push(
          ...extra.questions
            .slice(0, count - questions.length)
            .map((q) => ({ ...q, skill_tag: photo.skill_tag })),
        );
      }
      title = `Photo drill: ${skillName(photo.skill_tag)}`;
    }
    const paper = DrillPaper.parse({ questions });
    const skill_tags = [...new Set(questions.map((q) => q.skill_tag))];
    const { data, error } = await supabase
      .from("drill_sets")
      .insert({ player_id: playerId, title, source, skill_tags, paper })
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not save drill set.");
    // Keys never leave: the client fetches the stripped paper via GET.
    return NextResponse.json({ id: (data as { id: string }).id, title, count: questions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Drill forge failed.";
    if (err instanceof MetaLLMError) return NextResponse.json({ error: msg }, { status: 422 });
    console.error("drill forge failed:", msg);
    return NextResponse.json({ error: "Drill forge failed — retry." }, { status: 500 });
  }
}

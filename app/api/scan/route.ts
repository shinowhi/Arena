import { NextResponse } from "next/server";
import { decomposeImage } from "@/lib/agents/vision-decomposer";
import { findGap } from "@/lib/agents/gap-finder";
import { MetaLLMError } from "@/lib/llm/meta";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { logFunnel } from "@/lib/funnel";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { FREE_SCAN_DAILY, isVip, countToday, quotaAllowed } from "@/lib/vip";
import { sampleDiagnosis } from "@/lib/scan/samples";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  let imageDataUrl: string;
  let sampleId = "";
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing image file." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 5MB)." }, { status: 400 });
    const s = form.get("sample");
    if (typeof s === "string") sampleId = s;
    const buf = Buffer.from(await file.arrayBuffer());
    imageDataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  } catch {
    return NextResponse.json({ error: "Could not read upload." }, { status: 400 });
  }
  // B1 sample hero path: known sample id -> instant cached diagnosis,
  // labeled "sample". Skips LLM and the scans insert (demo fixtures
  // don't pollute history). Unknown ids fall through to the real path.
  if (sampleId) {
    const hit = sampleDiagnosis(sampleId);
    if (hit) return NextResponse.json(hit);
  }
  try {
    // Rate checks run before any LLM/DB work (after the cheap sample path).
    // The IP bucket runs on EVERY request, even when the player is known, so
    // cookieless callers can't dodge the player bucket by minting players.
    const playerId: string | null = await getOrCreatePlayerId().catch(() => null);
    const ipRl = checkRate(`scan:ip:${getClientIp(req)}`, 10, MINUTE_MS);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
    const rl = checkRate(`scan:${playerId ?? getClientIp(req)}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    // P2 free quota: 5 scans/day, checked BEFORE the LLM (and before the
    // scan_started log, so blocked attempts don't consume quota). Unknown
    // players (null) fail open on quota — the IP bucket above is the backstop.
    if (playerId) {
      const quotaDb = await createClient();
      const vip = await isVip(quotaDb, playerId);
      const used = vip ? 0 : await countToday(quotaDb, playerId, "scan_started");
      if (!quotaAllowed(used, FREE_SCAN_DAILY, vip)) {
        return NextResponse.json(
          {
            error: `Daily free limit reached (${FREE_SCAN_DAILY} scans). Enter a VIP code to continue.`,
            vip_url: "/vip",
          },
          { status: 402 },
        );
      }
    }
    await logFunnel(await createClient(), playerId, "scan_started");
    const decomp = await decomposeImage(imageDataUrl);
    const gap = await findGap(decomp);
    try {
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
    await logFunnel(await createClient(), playerId, "scan_completed");
    return NextResponse.json({ ...decomp, ...gap, can_summon: gap.confidence >= 0.3 });
  } catch (err) {
    const raw = err instanceof MetaLLMError ? err.message : "Analysis failed.";
    const msg = /schema|valid|json|parse|empty|no problem/i.test(raw)
      ? "No solvable problems found. Take a photo of worked exercises (not theory notes)."
      : raw;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}

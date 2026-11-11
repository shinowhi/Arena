import { NextResponse } from "next/server";
import { decomposeImage } from "@/lib/agents/vision-decomposer";
import { findGap } from "@/lib/agents/gap-finder";
import { mergeGaps } from "@/lib/scan/merge";
import { MetaLLMError } from "@/lib/llm/meta";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { logFunnel } from "@/lib/funnel";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { FREE_SCAN_DAILY, isVip, countToday } from "@/lib/vip";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 3;

type PhotoResult = {
  items: Array<{ cau_hoi: string; dap_an_sinh_vien: string; skill_tag: string[] }>;
  weak_skill: string;
  root_cause: string;
  confidence: number;
};

async function diagnoseOne(imageDataUrl: string): Promise<PhotoResult> {
  const decomp = await decomposeImage(imageDataUrl);
  const gap = await findGap(decomp);
  return { ...decomp, ...gap };
}

export async function POST(req: Request) {
  let images: string[];
  try {
    const form = await req.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length < 2 || files.length > MAX_PHOTOS) {
      return NextResponse.json({ error: "Send 2-3 image files as 'images'." }, { status: 400 });
    }
    images = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Every file must be an image." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "One image is too large (max 5MB each)." }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      images.push(`data:${file.type};base64,${buf.toString("base64")}`);
    }
  } catch {
    return NextResponse.json({ error: "Could not read uploads." }, { status: 400 });
  }
  try {
    // Rate + quota gates run before any LLM work, mirroring the single-scan
    // route. The IP bucket runs on EVERY request, even when the player is
    // known, so cookieless callers cannot dodge the player bucket by minting
    // players. Keys are batch-specific so single and batch scans do not share
    // budget. Each image in the batch consumes one free scan.
    const playerId: string | null = await getOrCreatePlayerId().catch(() => null);
    const ipRl = checkRate(`scan-batch:ip:${getClientIp(req)}`, 10, MINUTE_MS);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
    const rl = checkRate(`scan-batch:${playerId ?? getClientIp(req)}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    // P2 free quota: 5 scans/day, charged per image (before the scan_started
    // logs, so blocked attempts do not consume quota). Unknown players (null)
    // fail open on quota - the IP bucket above is the backstop.
    if (playerId) {
      const quotaDb = await createClient();
      const vip = await isVip(quotaDb, playerId);
      const used = vip ? 0 : await countToday(quotaDb, playerId, "scan_started");
      if (!vip && used + images.length > FREE_SCAN_DAILY) {
        return NextResponse.json(
          {
            error: `Daily free limit reached (${FREE_SCAN_DAILY} scans). Enter a VIP code to continue.`,
            vip_url: "/vip",
          },
          { status: 402 },
        );
      }
    }
    // Photos are independent: diagnose concurrently. One bad photo must not
    // kill the batch — merge whatever succeeded (at least 1 required).
    const settled = await Promise.allSettled(images.map(diagnoseOne));
    const photos = settled
      .filter((s): s is PromiseFulfilledResult<PhotoResult> => s.status === "fulfilled")
      .map((s) => s.value);
    if (photos.length === 0) {
      const first = settled[0];
      const raw =
        first.status === "rejected" && first.reason instanceof Error
          ? first.reason.message
          : "Analysis failed.";
      if (/schema|valid|json|parse|empty|no problem/i.test(raw)) {
        return NextResponse.json(
          { error: "No solvable problems found. Take photos of worked exercises (not theory notes)." },
          { status: 422 },
        );
      }
      throw first.status === "rejected" ? first.reason : new Error("Analysis failed.");
    }
    const merged = mergeGaps(photos);
    try {
      if (!playerId) throw new Error("player lookup failed");
      const supabase = await createClient();
      await supabase.from("scans").insert(
        photos.map((p) => ({
          player_id: playerId,
          questions: p.items,
          weak_skill: p.weak_skill,
          root_cause: p.root_cause,
          confidence: p.confidence,
        })),
      );
    } catch (dbErr) {
      console.error("batch scan save failed (diagnosis still returned):", dbErr);
    }
    // Quota accounting: one scan_started per image, logged after success so
    // failed batches do not consume quota. Best-effort (never throws).
    for (let i = 0; i < images.length; i++) {
      await logFunnel(await createClient(), playerId, "scan_started");
    }
    return NextResponse.json({ photos, merged, can_summon: merged.confidence >= 0.3 });
  } catch (err) {
    const raw = err instanceof MetaLLMError ? err.message : "Analysis failed.";
    const msg = /schema|valid|json|parse|empty|no problem/i.test(raw)
      ? "No solvable problems found. Take photos of worked exercises (not theory notes)."
      : raw;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}

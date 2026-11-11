import { NextResponse } from "next/server";
import { z } from "zod";
import { gradeEssay } from "@/lib/agents/essay-grader";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { logFunnel } from "@/lib/funnel";
import { getPlayerId } from "@/lib/game/player";
import { isVip } from "@/lib/vip";

// Essay grading: photo and/or pasted solution → rubric steps + machine-audited
// numeric verdicts. Stateless: nothing stored, nothing logged.
const Body = z
  .object({
    image: z.string().max(700000).optional(),
    text: z.string().max(4000).optional(),
  })
  .refine((b) => (b.image?.length ?? 0) > 100 || (b.text?.trim().length ?? 0) > 0, {
    message: "Provide a photo or pasted solution.",
  });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const tooBig = parsed.error.issues.some((i) => i.path[0] === "image" && i.code === "too_big");
    if (tooBig) {
      // Same copy as UPLOAD_TOO_LARGE in lib/scan/image-prep.ts (kept literal:
      // that module is client-side).
      return NextResponse.json({ error: "This photo is too large even after shrinking — try a smaller photo." }, { status: 413 });
    }
    return NextResponse.json({ error: "Provide a photo or pasted solution." }, { status: 400 });
  }
  if (parsed.data.image && !/^data:image\/(jpeg|png|webp|gif);base64,/.test(parsed.data.image)) {
    return NextResponse.json({ error: "Photo must be a data URL image." }, { status: 400 });
  }
  const rl = checkRate(`essay:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  // P2: essay grading is VIP-only (premium hook), gated BEFORE the LLM.
  // Read-only identity: unknown visitors are not VIP and mint no player.
  {
    const playerId = await getPlayerId().catch(() => null);
    const vip = playerId ? await isVip(await createClient(), playerId) : false;
    if (!vip) {
      return NextResponse.json(
        {
          error: "Essay grading is a VIP feature. Enter a VIP code to unlock it.",
          vip_url: "/vip",
        },
        { status: 402 },
      );
    }
  }
  try {
    const out = await gradeEssay({ imageUrl: parsed.data.image, text: parsed.data.text });
    await logFunnel(await createClient(), null, "essay_graded");
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Grading failed — retry with a clearer photo." }, { status: 500 });
  }
}

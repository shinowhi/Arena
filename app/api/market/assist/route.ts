// POST /api/market/assist — photo -> bounty prefill (problem text + skill tag).
// Reuses the scan decomposer; returns NO correct answers (there are none involved).
import { NextResponse } from "next/server";
import { decomposeImage } from "@/lib/agents/vision-decomposer";
import { skillName } from "@/lib/graph/skills";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  // IP-only bucket (no player identity on this route): vision LLM follows.
  const ipRl = checkRate(`market-assist:ip:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
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
    return NextResponse.json({ error: "Could not read the image." }, { status: 400 });
  }
  try {
    const decomp = await decomposeImage(imageDataUrl);
    const first = decomp.items[0];
    const skill = first.skill_tag[0] ?? "";
    return NextResponse.json({
      problem_latex: first.cau_hoi,
      skill_tag: skill,
      skill_name: skill ? skillName(skill) : "",
      more: decomp.items.length - 1,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Photo assist failed. Type the problem instead." },
      { status: 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePaper, stripPaper } from "@/lib/agents/paper-generator";
import { MetaLLMError } from "@/lib/llm/meta";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

const Body = z.object({ skill_tag: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing skill_tag." }, { status: 400 });
  const rl = checkRate(`paper:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  try {
    const paper = await generatePaper(parsed.data.skill_tag);
    return NextResponse.json({ skill_tag: parsed.data.skill_tag, ...stripPaper(paper) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Paper forge failed.";
    const isSkill = err instanceof MetaLLMError && msg.startsWith("Invalid skill_tag");
    return NextResponse.json({ error: msg }, { status: isSkill ? 400 : 422 });
  }
}

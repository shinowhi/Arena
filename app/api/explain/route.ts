import { NextResponse } from "next/server";
import { z } from "zod";
import { explainRoot } from "@/lib/agents/explainer";
import { MetaLLMError } from "@/lib/llm/meta";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

const Body = z.object({ weak_skill: z.string().min(1), root_cause: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing weak_skill or root_cause." }, { status: 400 });
  // IP-only bucket (no player identity on this route): LLM call follows.
  const ipRl = checkRate(`explain:ip:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    const out = await explainRoot(parsed.data.weak_skill, parsed.data.root_cause);
    return NextResponse.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Explain failed.";
    const bad = err instanceof MetaLLMError && /Unknown|valid root/.test(msg);
    return NextResponse.json({ error: msg }, { status: bad ? 400 : 422 });
  }
}

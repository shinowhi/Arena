import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAnswer } from "@/lib/verify/math-verifier";
import { CheckSpecSchema as CheckSpec } from "@/lib/agents/boss-generator";

// Stateless practice grading: the client sends back the question's check
// spec (computation shape, not the answer) with its answer; the server
// recomputes with mathjs. No paper storage, no migration.

const Body = z.object({
  check: CheckSpec,
  tolerance: z.number().positive(),
  answer: z.number().finite(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing check, tolerance, or numeric answer." }, { status: 400 });
  try {
    const correct = verifyAnswer(parsed.data.check, parsed.data.answer, parsed.data.tolerance);
    return NextResponse.json({ correct });
  } catch {
    return NextResponse.json({ error: "Could not grade that answer." }, { status: 422 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAnswer } from "@/lib/verify/math-verifier";

// Stateless practice grading: the client sends back the question's check
// spec (computation shape, not the answer) with its answer; the server
// recomputes with mathjs. No paper storage, no migration.
const CheckSpec = z.union([
  z.object({ kind: z.literal("numeric"), prompt_expr: z.string().min(1) }),
  z.object({ kind: z.literal("derivative_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
  z.object({ kind: z.literal("integral_at"), expr: z.string().min(1), variable: z.string().min(1), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal("limit_at"), expr: z.string().min(1), variable: z.string().min(1), at: z.number() }),
]);

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

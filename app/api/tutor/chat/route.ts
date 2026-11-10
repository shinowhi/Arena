import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { checkRate, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import {
  chatTutor,
  resolveForbidden,
  TutorContext,
  TutorHistory,
  TutorNotFound,
  TutorStale,
} from "@/lib/agents/chat-tutor";

// Free-chat tutor. The client sends chat history plus a question REFERENCE;
// the server resolves the key itself and leak-scans every reply in code.
// Chat is session-only: nothing is stored, nothing is logged.
const Body = z.object({ messages: TutorHistory, context: TutorContext });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing messages or context." }, { status: 400 });
  if (parsed.data.messages[parsed.data.messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user." }, { status: 400 });
  }
  try {
    const playerId = await getOrCreatePlayerId();
    const rl = checkRate(`tutor:${playerId}`, 30, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    let fb;
    try {
      fb = await resolveForbidden(supabase, playerId, parsed.data.context);
    } catch (e) {
      if (e instanceof TutorStale) return NextResponse.json({ error: "Paper refreshed — reload." }, { status: 409 });
      if (e instanceof TutorNotFound) return NextResponse.json({ error: "Question not found." }, { status: 404 });
      throw e;
    }
    const out = await chatTutor(parsed.data.messages, fb);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Tutor failed — retry." }, { status: 500 });
  }
}

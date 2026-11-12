import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { logFunnel } from "@/lib/funnel";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { FREE_TUTOR_DAILY, isVip, countToday, quotaAllowed } from "@/lib/vip";
import {
  chatTutor,
  resolveForbidden,
  TutorContext,
  TutorHistory,
  TutorNotFound,
  TutorStale,
} from "@/lib/agents/chat-tutor";
import {
  COMBINED_WINDOW,
  getThreadOwner,
  loadThreadMessages,
  persistTurn,
  resolveThreadMode,
  sliceContext,
} from "@/lib/tutor/threads";

// Free-chat tutor. The client sends chat history plus a question REFERENCE;
// the server resolves the key itself and leak-scans every reply in code.
// Free chat is session-only: nothing is stored, nothing is logged. VIPs may
// pass thread_id for server-side memory (last 12 stored turns prepended, new
// turns persisted); free + thread_id ignores the thread (stateless, current
// behavior), VIP + foreign/missing thread is a 403.
const Body = z.object({ messages: TutorHistory, context: TutorContext, thread_id: z.string().uuid().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing messages or context." }, { status: 400 });
  if (parsed.data.messages[parsed.data.messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Last message must be from the user." }, { status: 400 });
  }
  try {
    const playerId = await getOrCreatePlayerId();
    // IP bucket runs on EVERY request so cookieless callers can't dodge the
    // player bucket by minting players.
    const ipRl = checkRate(`tutor:ip:${getClientIp(req)}`, 30, MINUTE_MS);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
    const rl = checkRate(`tutor:${playerId}`, 30, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    // P2 free quota: 10 tutor chats/day, checked BEFORE the LLM.
    const vip = await isVip(supabase, playerId);
    {
      const used = vip ? 0 : await countToday(supabase, playerId, "tutor_asked");
      if (!quotaAllowed(used, FREE_TUTOR_DAILY, vip)) {
        return NextResponse.json(
          {
            error: `Daily free limit reached (${FREE_TUTOR_DAILY} tutor chats). Enter a VIP code to continue.`,
            vip_url: "/vip",
          },
          { status: 402 },
        );
      }
    }
    // P4.4 VIP memory: optional thread_id. Owner lookup runs for VIPs only —
    // free callers skip it entirely (their thread is ignored, never a 403).
    // 403 covers foreign AND missing threads alike: no existence oracle.
    let history = parsed.data.messages;
    let memoryThread: string | null = null;
    if (parsed.data.thread_id) {
      const owner = vip ? await getThreadOwner(supabase, parsed.data.thread_id) : null;
      const mode = resolveThreadMode(vip, parsed.data.thread_id, owner, playerId);
      if (mode === "forbidden") {
        return NextResponse.json({ error: "Thread not found." }, { status: 403 });
      }
      if (mode === "context") {
        memoryThread = parsed.data.thread_id;
        const stored = await loadThreadMessages(supabase, memoryThread);
        history = sliceContext([...stored, ...parsed.data.messages], COMBINED_WINDOW);
      }
    }
    let fb;
    try {
      fb = await resolveForbidden(supabase, playerId, parsed.data.context);
    } catch (e) {
      if (e instanceof TutorStale) return NextResponse.json({ error: "Paper refreshed — reload." }, { status: 409 });
      if (e instanceof TutorNotFound) return NextResponse.json({ error: "Question not found." }, { status: 404 });
      throw e;
    }
    const out = await chatTutor(history, fb);
    if (memoryThread) {
      // Best-effort: persistTurn never throws, so memory loss can't fail chat.
      await persistTurn(
        supabase,
        memoryThread,
        parsed.data.messages[parsed.data.messages.length - 1].content,
        out.reply,
      );
    }
    await logFunnel(supabase, playerId, "tutor_asked");
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Tutor failed — retry." }, { status: 500 });
  }
}

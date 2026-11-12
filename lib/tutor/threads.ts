import type { SupabaseClient } from "@supabase/supabase-js";

// P4.4 VIP TUTOR+ memory: threaded chat history for VIPs. Free users keep the
// stateless chat in lib/agents/chat-tutor.ts (NOT edited — this module wraps
// it at the route layer). Pure rules (sliceContext, threadOwnedBy,
// resolveThreadMode, sanitizeTitle, previewOf) are mirror-tested offline in
// scripts/test-tutor-threads.mjs. DB helpers never throw: context loading and
// persistence are best-effort and must never fail the chat itself.
export const CONTEXT_WINDOW = 12;
export const COMBINED_WINDOW = 20;
export const THREADS_LIMIT = 20;
export const TITLE_MAX = 80;
export const PREVIEW_MAX = 80;
export const DEFAULT_TITLE = "Chat";

export type ThreadRole = "user" | "assistant";
export type ThreadMessage = { role: ThreadRole; content: string };
export type ThreadMode = "context" | "stateless" | "forbidden";

// Pure: last n turns, order preserved.
export function sliceContext<T>(messages: T[], n: number = CONTEXT_WINDOW): T[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  return messages.slice(-n);
}

// Pure: does this thread row belong to the caller? A null row (missing, or a
// DB error the caller collapsed to null) never belongs to anyone.
export function threadOwnedBy(threadPlayerId: string | null, callerPlayerId: string): boolean {
  return typeof threadPlayerId === "string" && threadPlayerId === callerPlayerId;
}

// Pure: VIP gate matrix for a chat request carrying an optional thread_id.
// - no thread -> stateless (free behavior, byte-identical)
// - free + thread (even foreign/missing) -> stateless: the thread is IGNORED,
//   never a 403 (free users own no threads, so there is nothing to leak)
// - vip + own thread -> context (load history + persist this turn)
// - vip + foreign/missing thread -> forbidden (one status for both: no
//   existence oracle)
export function resolveThreadMode(
  vip: boolean,
  threadId: string | undefined,
  threadPlayerId: string | null,
  callerPlayerId: string,
): ThreadMode {
  if (!threadId) return "stateless";
  if (!vip) return "stateless";
  return threadOwnedBy(threadPlayerId, callerPlayerId) ? "context" : "forbidden";
}

// Pure: title rules (trim, default, cap). Never empty.
export function sanitizeTitle(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_TITLE;
  const t = raw.trim().slice(0, TITLE_MAX);
  return t.length > 0 ? t : DEFAULT_TITLE;
}

// Pure: list preview from the latest message (single line, trimmed, capped).
export function previewOf(content: string | null): string {
  if (typeof content !== "string") return "";
  return content.replace(/\s+/g, " ").trim().slice(0, PREVIEW_MAX);
}

type Supa = SupabaseClient;

// Owner id of a thread, or null (no such row / DB error -> the route's
// resolveThreadMode maps null to forbidden: fail closed).
export async function getThreadOwner(supa: Supa, threadId: string): Promise<string | null> {
  try {
    const { data, error } = await supa
      .from("tutor_threads")
      .select("player_id")
      .eq("id", threadId)
      .maybeSingle();
    if (error || !data) return null;
    const pid = (data as { player_id: unknown }).player_id;
    return typeof pid === "string" ? pid : null;
  } catch {
    return null;
  }
}

// Last `limit` messages of a thread, chronological (oldest first). [] on any
// error — the chat then proceeds with live history only.
export async function loadThreadMessages(
  supa: Supa,
  threadId: string,
  limit: number = CONTEXT_WINDOW,
): Promise<ThreadMessage[]> {
  try {
    const { data, error } = await supa
      .from("tutor_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, limit));
    if (error || !Array.isArray(data)) return [];
    const rows = (data as Array<{ role: unknown; content: unknown }>)
      .filter(
        (r) =>
          (r.role === "user" || r.role === "assistant") &&
          typeof r.content === "string" &&
          r.content.length >= 1,
      )
      .map((r) => ({
        role: r.role as ThreadRole,
        // Assistant cap is roomier: long explanations must survive intact.
        content: (r.content as string).slice(0, r.role === "assistant" ? 6000 : 2000),
      }));
    return rows.reverse();
  } catch {
    return [];
  }
}

// Appends one user turn + its assistant reply as two SEQUENTIAL inserts (two
// transactions, so now() differs and created_at ordering stays unambiguous —
// a single multi-row insert would stamp both rows identically). Never throws.
export async function persistTurn(
  supa: Supa,
  threadId: string,
  user: string,
  assistant: string,
): Promise<void> {
  try {
    await supa
      .from("tutor_messages")
      .insert({ thread_id: threadId, role: "user", content: user.slice(0, 2000) });
    await supa
      .from("tutor_messages")
      .insert({ thread_id: threadId, role: "assistant", content: assistant.slice(0, 6000) });
  } catch {
    // Best-effort: memory loss must never fail the chat.
  }
}

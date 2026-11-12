"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Msg = { role: "user" | "assistant"; content: string };
type Ctx =
  | { kind: "none" }
  | { kind: "miss"; boss_id: string; question_index: number }
  | { kind: "exam"; section: string; index: number; as_of: string };
type Thread = { id: string; title: string; created_at: string; preview: string };
type Nudge = { label: string; href: string; reason: string };

const HELLO = "Hi! I'm your AI tutor. Ask me anything you're studying — or paste a problem and we'll work through it together.";

function ctxFromParams(p: URLSearchParams): Ctx {
  if (p.get("ctx") === "miss" && p.get("boss")) {
    return { kind: "miss", boss_id: p.get("boss") ?? "", question_index: Number(p.get("idx") ?? 0) || 0 };
  }
  if (p.get("ctx") === "exam" && p.get("section")) {
    return { kind: "exam", section: p.get("section") ?? "", index: Number(p.get("index") ?? 0) || 0, as_of: p.get("as_of") ?? "" };
  }
  return { kind: "none" };
}

function ctxKey(c: Ctx): string {
  if (c.kind === "miss") return `miss:${c.boss_id}:${c.question_index}`;
  if (c.kind === "exam") return `exam:${c.section}:${c.index}`;
  return "free";
}

function reasonLabel(reason: string): string {
  if (reason === "due") return "Due";
  if (reason === "weak") return "Weak";
  return "Suggested";
}

function TutorInner() {
  const search = useSearchParams();
  const [ctx] = useState<Ctx>(() => ctxFromParams(search));
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: HELLO }]);
  const [question, setQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [vip, setVip] = useState<boolean | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [threadsError, setThreadsError] = useState("");
  const [creating, setCreating] = useState(false);
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const storeKey = `arena_tutor_v1:${ctxKey(ctx)}`;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      const d = raw ? (JSON.parse(raw) as { messages: Msg[]; question: string | null } | null) : null;
      if (d && Array.isArray(d.messages) && d.messages.length > 0) {
        queueMicrotask(() => {
          setMessages(d.messages.slice(-20));
          setQuestion(typeof d.question === "string" ? d.question : null);
        });
      }
    } catch {
      // Corrupt entry: start fresh.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Thread mode skips the client cache: the server holds thread memory.
    if (activeThread) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ messages: messages.slice(-20), question }));
    } catch {
      // Quota/private mode: chat still works, just not resumable.
    }
  }, [storeKey, messages, question, activeThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  // VIP status, thread list, and homework nudges load once; every failure
  // degrades to plain stateless chat (the card/list simply stays hidden).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/vip/status");
        if (!r.ok) return;
        const d = await readApiJson<{ vip: boolean }>(r, "VIP status failed.");
        if (alive) setVip(d.vip === true);
      } catch {
        // Unknown: the new-thread button attempt-gates via 402 instead.
      }
    })();
    (async () => {
      try {
        const r = await fetch("/api/tutor/threads");
        if (!r.ok) throw new Error("threads failed");
        const d = await readApiJson<{ threads: Thread[] }>(r, "Threads failed.");
        if (alive) setThreads(Array.isArray(d.threads) ? d.threads : []);
      } catch {
        if (alive) setThreads([]);
      }
    })();
    (async () => {
      try {
        const r = await fetch("/api/tutor/nudge");
        if (!r.ok) return;
        const d = await readApiJson<{ items: Nudge[] }>(r, "Nudges failed.");
        if (alive && Array.isArray(d.items)) setNudges(d.items);
      } catch {
        // Nudge card stays hidden.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function selectThread(id: string | null) {
    setActiveThread(id);
    setMessages([{ role: "assistant", content: HELLO }]);
    setQuestion(null);
    setError("");
  }

  async function newThread() {
    if (creating) return;
    setCreating(true);
    setThreadsError("");
    try {
      const r = await fetch("/api/tutor/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.status === 402) {
        setUpsell(true);
        return;
      }
      if (!r.ok) throw new Error(await readApiError(r, "Could not create thread."));
      const t = await readApiJson<Thread>(r, "Could not create thread.");
      setThreads((ts) => (ts ? [t, ...ts] : [t]));
      selectThread(t.id);
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : "Could not create thread.");
    } finally {
      setCreating(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    const next: Msg[] = [...messages.slice(-19), { role: "user" as const, content: text.slice(0, 2000) }];
    setMessages(next);
    setDraft("");
    setSending(true);
    setError("");
    try {
      // Thread mode sends only the new turn — the server prepends the last
      // 12 stored turns. Stateless mode sends visible history as before.
      const body = activeThread
        ? { messages: [{ role: "user" as const, content: text.slice(0, 2000) }], context: ctx, thread_id: activeThread }
        : { messages: next, context: ctx };
      const r = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 403) {
        // Thread gone or foreign mid-session: drop back to stateless chat.
        setActiveThread(null);
      }
      if (!r.ok) throw new Error(await readApiError(r, "Tutor failed."));
      const d = await readApiJson<{ reply: string; question: string | null }>(r, "Tutor failed.");
      setMessages((m) => [...m, { role: "assistant" as const, content: d.reply }].slice(-20));
      if (typeof d.question === "string") setQuestion(d.question);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tutor failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8">
      <PageHeader
        kicker="AI tutor"
        title={<>Ask <span className="arena-title">anything</span></>}
        sub={ctx.kind === "none" ? "Free study chat. Socratic by default — I guide, you solve." : "Attached to your live question. I guide — I never reveal the answer."}
      />
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <aside aria-label="Chat threads" className="arena-card w-full shrink-0 rounded-2xl p-4 md:w-64">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Threads</p>
            {activeThread ? (
              <button
                type="button"
                onClick={() => selectThread(null)}
                className="text-xs font-bold text-amber-300 hover:text-amber-200"
              >
                New chat
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto md:max-h-96">
            {threads === null ? (
              <span className="arena-shimmer inline-block h-8 w-full rounded-lg" role="status" aria-label="Loading threads" />
            ) : threads.length === 0 ? (
              <p className="text-sm text-zinc-500">No threads yet — VIPs can keep chats with memory.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectThread(t.id)}
                  aria-pressed={activeThread === t.id}
                  className={`rounded-lg px-3 py-2 text-left ${activeThread === t.id ? "arena-btn-primary text-white" : "text-zinc-300 hover:bg-white/5"}`}
                >
                  <span className="block truncate text-sm font-bold">{t.title}</span>
                  {t.preview ? <span className="block truncate text-xs opacity-70">{t.preview}</span> : null}
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => void newThread()}
            disabled={creating}
            className="arena-btn-primary mt-3 w-full rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {creating ? "Creating…" : "+ New thread (VIP)"}
          </button>
          {threadsError ? (
            <p role="alert" className="mt-2 text-xs text-red-300">{threadsError}</p>
          ) : null}
          {upsell || vip === false ? (
            <p className="mt-2 text-xs text-zinc-400">
              Thread memory is a VIP feature.{" "}
              <Link href="/vip" className="font-bold text-amber-300 hover:text-amber-200">
                Get VIP
              </Link>
            </p>
          ) : null}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          {nudges && nudges.length > 0 ? (
            <div className="arena-card rounded-2xl p-4">
              <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Review due</p>
              <ul className="mt-2 flex flex-col gap-2">
                {nudges.map((ng) => (
                  <li key={ng.href} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-100">{ng.label}</p>
                      <p className="text-xs text-zinc-500">{reasonLabel(ng.reason)}</p>
                    </div>
                    <Link
                      href={ng.href.startsWith("/drill") ? ng.href : "/drill"}
                      className="arena-btn-primary shrink-0 rounded-full px-4 py-1.5 text-xs font-bold text-white"
                    >
                      Practice
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {question ? (
            <div className="arena-card rounded-2xl p-4">
              <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Stuck on</p>
              <MathText text={question} className="mt-1 overflow-x-auto text-zinc-100" />
            </div>
          ) : null}
          <div className="flex flex-col gap-3" role="log" aria-label="Tutor chat" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "arena-btn-primary self-end text-white" : "arena-card self-start text-zinc-100"}`}>
                <MathText text={m.content} className="text-[15px] leading-relaxed" />
              </div>
            ))}
            {sending ? (
              <div className="arena-card max-w-[85%] self-start rounded-2xl px-4 py-2.5" role="status" aria-label="Tutor typing">
                <span className="arena-shimmer inline-block h-4 w-24 rounded" />
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
          {error ? (
            <p role="alert" className="text-center text-sm text-red-300">{error}</p>
          ) : null}
          <div className="sticky bottom-0 flex gap-2 bg-transparent py-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              placeholder="Ask a concept, paste a problem…"
              aria-label="Message the tutor"
              maxLength={2000}
              disabled={sending}
              className="arena-input min-w-0 flex-1 rounded-full px-5 py-2.5 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || draft.trim() === ""}
              className="arena-btn-primary shrink-0 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function TutorPage() {
  return (
    <Suspense>
      <TutorInner />
    </Suspense>
  );
}

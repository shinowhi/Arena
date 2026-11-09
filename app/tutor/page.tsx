"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Msg = { role: "user" | "assistant"; content: string };
type Ctx =
  | { kind: "none" }
  | { kind: "miss"; boss_id: string; question_index: number }
  | { kind: "exam"; section: string; index: number; as_of: string };

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

function TutorInner() {
  const search = useSearchParams();
  const [ctx] = useState<Ctx>(() => ctxFromParams(search));
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: HELLO }]);
  const [question, setQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
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
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ messages: messages.slice(-20), question }));
    } catch {
      // Quota/private mode: chat still works, just not resumable.
    }
  }, [storeKey, messages, question]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    const next: Msg[] = [...messages.slice(-19), { role: "user" as const, content: text.slice(0, 2000) }];
    setMessages(next);
    setDraft("");
    setSending(true);
    setError("");
    try {
      const r = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context: ctx }),
      });
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
      <PageHeader
        kicker="AI tutor"
        title={<>Ask <span className="arena-title">anything</span></>}
        sub={ctx.kind === "none" ? "Free study chat. Socratic by default — I guide, you solve." : "Attached to your live question. I guide — I never reveal the answer."}
      />
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

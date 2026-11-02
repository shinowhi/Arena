"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CHAT_POLL_MS, MESSAGE_MAX_LEN, displayTime } from "@/lib/social/rules";

interface Peer {
  id: string;
  peer_id: string;
  label?: string;
}

interface Msg {
  id: string;
  mine: boolean;
  body: string;
  created_at: string;
}

function ChatInner() {
  const params = useSearchParams();
  const [friends, setFriends] = useState<Peer[]>([]);
  const [peer, setPeer] = useState(() => (params.get("with") ?? "").trim());
  const [peerLabel, setPeerLabel] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function loadFriends() {
      try {
        const res = await fetch("/api/social/friends");
        const data = (await res.json().catch(() => null)) as {
          friends?: Peer[];
          needsMigration?: boolean;
        } | null;
        if (!alive || !data) return;
        if (data.needsMigration) {
          setNeedsMigration(true);
          return;
        }
        setFriends(Array.isArray(data.friends) ? data.friends : []);
      } catch {
        if (alive) setMsg("Could not load friends.");
      }
    }
    void loadFriends();
    return () => {
      alive = false;
    };
  }, []);

  // Poll the thread (plain fetch on an interval — no extra libraries).
  useEffect(() => {
    if (!peer) return;
    let alive = true;
    async function load() {
      try {
        const res = await fetch(`/api/social/chat?with=${encodeURIComponent(peer)}`);
        const data = (await res.json().catch(() => null)) as {
          peer?: { label?: string };
          messages?: Msg[];
          error?: string;
          needsMigration?: boolean;
        } | null;
        if (!alive || !data) return;
        if (data.needsMigration) {
          setNeedsMigration(true);
          return;
        }
        if (!res.ok) {
          setMsg(typeof data.error === "string" ? data.error : "Could not load chat.");
          return;
        }
        setPeerLabel(typeof data.peer?.label === "string" ? data.peer.label : "");
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch {
        if (alive) setMsg("Connection lost — retrying…");
      }
    }
    void load();
    const t = setInterval(() => void load(), CHAT_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [peer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || !peer || sending) return;
    setSending(true);
    setMsg("");
    try {
      const res = await fetch("/api/social/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: peer, body: body.slice(0, MESSAGE_MAX_LEN) }),
      });
      const data = (await res.json().catch(() => null)) as {
        id?: string;
        error?: string;
        needsMigration?: boolean;
      } | null;
      if (data?.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not send.");
      setDraft("");
      const reload = await fetch(`/api/social/chat?with=${encodeURIComponent(peer)}`);
      const fresh = (await reload.json().catch(() => null)) as { messages?: Msg[] } | null;
      if (Array.isArray(fresh?.messages)) setMessages(fresh.messages);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← Back</Link>
      <h1 className="mt-2 text-3xl font-extrabold text-zinc-100">Chat</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Private messages with friends only — strangers cannot reach you here.
      </p>

      {needsMigration && (
        <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Chat needs a database update (migration 0006) — ask the site owner to run it in
          Supabase.
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <label className="block text-xs text-zinc-400">
          Friend
          <select
            value={peer}
            onChange={(e) => {
              setMessages([]);
              setPeer(e.target.value);
            }}
            className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Pick a friend…</option>
            {friends.map((f) => (
              <option key={f.id} value={f.peer_id}>{f.label ?? f.peer_id}</option>
            ))}
          </select>
        </label>
        {friends.length === 0 && !needsMigration && (
          <p className="mt-2 text-sm text-zinc-500">
            No friends yet — <Link href="/friends" className="text-amber-300 underline">add one</Link> first.
          </p>
        )}

        {peer && (
          <>
            <div className="mt-4 h-80 space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              {messages.length === 0 && (
                <p className="text-center text-sm text-zinc-500">
                  Say hi to {peerLabel || "your friend"} — messages appear here.
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={m.mine ? "text-right" : "text-left"}>
                  <span
                    className={`inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-1.5 text-sm ${
                      m.mine ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    {m.body}
                  </span>
                  <p className="mt-0.5 text-[11px] text-zinc-600">{displayTime(m.created_at)}</p>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
                placeholder={`Message ${peerLabel || "friend"}…`}
                aria-label="Message"
                maxLength={MESSAGE_MAX_LEN}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
              <button
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-black hover:bg-sky-400 disabled:opacity-50"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
            <p className="mt-1 text-right text-[11px] text-zinc-600">
              {draft.length}/{MESSAGE_MAX_LEN}
            </p>
          </>
        )}
      </section>

      {msg && <p className="mt-3 text-sm text-amber-300">{msg}</p>}
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={<main className="mx-auto max-w-3xl px-4 py-10 text-sm text-zinc-400">Loading chat…</main>}
    >
      <ChatInner />
    </Suspense>
  );
}

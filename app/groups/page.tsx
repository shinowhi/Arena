"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CHAT_POLL_MS, GROUP_NAME_MAX, MESSAGE_MAX_LEN, displayTime } from "@/lib/social/rules";

interface Room {
  id: string;
  name: string;
  mine: boolean;
  members: number;
}

interface Member {
  id: string;
  label: string;
  you: boolean;
}

interface Peer {
  id: string;
  peer_id: string;
  label?: string;
}

interface Msg {
  id: string;
  mine: boolean;
  sender: string;
  body: string;
  created_at: string;
}

export default function GroupsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [room, setRoom] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [friends, setFriends] = useState<Peer[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [roomName, setRoomName] = useState("");
  const [invite, setInvite] = useState("");
  const [draft, setDraft] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);
  const [msg, setMsg] = useState("");
  const [bump, setBump] = useState(0);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [gRes, fRes] = await Promise.all([fetch("/api/social/groups"), fetch("/api/social/friends")]);
        const gData = (await gRes.json().catch(() => null)) as {
          groups?: Room[];
          needsMigration?: boolean;
        } | null;
        const fData = (await fRes.json().catch(() => null)) as {
          friends?: Peer[];
          needsMigration?: boolean;
        } | null;
        if (!alive) return;
        if (gData?.needsMigration || fData?.needsMigration) {
          setNeedsMigration(true);
          return;
        }
        setRooms(Array.isArray(gData?.groups) ? gData.groups : []);
        setFriends(Array.isArray(fData?.friends) ? fData.friends : []);
      } catch {
        if (alive) setMsg("Could not load rooms.");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [bump]);

  // Poll members + messages for the open room.
  useEffect(() => {
    if (!room) return;
    let alive = true;
    async function load() {
      try {
        const [mRes, cRes] = await Promise.all([
          fetch(`/api/social/groups/members?group_id=${encodeURIComponent(room)}`),
          fetch(`/api/social/groups/messages?group_id=${encodeURIComponent(room)}`),
        ]);
        const mData = (await mRes.json().catch(() => null)) as {
          members?: Member[];
          error?: string;
          needsMigration?: boolean;
        } | null;
        const cData = (await cRes.json().catch(() => null)) as {
          messages?: Msg[];
          needsMigration?: boolean;
        } | null;
        if (!alive) return;
        if (mData?.needsMigration || cData?.needsMigration) {
          setNeedsMigration(true);
          return;
        }
        if (!mRes.ok) {
          setMsg(typeof mData?.error === "string" ? mData.error : "Could not load room.");
          return;
        }
        setMembers(Array.isArray(mData?.members) ? mData.members : []);
        setMessages(Array.isArray(cData?.messages) ? cData.messages : []);
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
  }, [room, bump]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function createRoom() {
    const name = roomName.trim();
    if (!name || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/social/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.slice(0, GROUP_NAME_MAX) }),
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
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not create room.");
      setRoomName("");
      setMsg("Room created — invite your friends below.");
      if (typeof data?.id === "string") setRoom(data.id);
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  }

  async function inviteFriend() {
    if (!invite || !room || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/social/groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: room, friend_id: invite }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        needsMigration?: boolean;
      } | null;
      if (data?.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not invite.");
      setInvite("");
      setMsg("Friend invited.");
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not invite.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || !room || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/social/groups/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: room, body: body.slice(0, MESSAGE_MAX_LEN) }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        needsMigration?: boolean;
      } | null;
      if (data?.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not send.");
      setDraft("");
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  const roomNameShown = rooms.find((r) => r.id === room)?.name ?? "";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← Back</Link>
      <h1 className="mt-2 text-3xl font-extrabold text-zinc-100">Groups</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Study rooms for you and your friends — create one, invite friends, chat together.
      </p>

      {needsMigration && (
        <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Groups need a database update (migration 0006) — ask the site owner to run it in
          Supabase.
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">My rooms</p>
        <div className="mt-2 flex gap-2">
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="New room name"
            aria-label="New room name"
            maxLength={GROUP_NAME_MAX}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
          <button
            onClick={() => void createRoom()}
            disabled={busy || needsMigration || !roomName.trim()}
            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
          >
            Create
          </button>
        </div>
        {rooms.length === 0 && !needsMigration && (
          <p className="mt-2 text-sm text-zinc-500">No rooms yet — create one above.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setMessages([]);
                setMembers([]);
                setRoom(r.id);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                r.id === room
                  ? "bg-amber-500 text-black"
                  : "border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {r.name} ({r.members})
            </button>
          ))}
        </div>

        {room && (
          <>
            <p className="mt-4 text-sm font-semibold text-zinc-200">
              {roomNameShown} — members ({members.length})
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {members.map((m) => `${m.label}${m.you ? " (you)" : ""}`).join(", ") || "…"}
            </p>
            <div className="mt-2 flex gap-2">
              <select
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                aria-label="Friend to invite"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Invite a friend…</option>
                {friends
                  .filter((f) => !members.some((m) => m.id === f.peer_id))
                  .map((f) => (
                    <option key={f.id} value={f.peer_id}>{f.label ?? f.peer_id}</option>
                  ))}
              </select>
              <button
                onClick={() => void inviteFriend()}
                disabled={busy || !invite}
                className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                Invite
              </button>
            </div>

            <div className="mt-4 h-72 space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              {messages.length === 0 && (
                <p className="text-center text-sm text-zinc-500">No messages yet — start the study chat.</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={m.mine ? "text-right" : "text-left"}>
                  {!m.mine && <p className="text-[11px] font-semibold text-zinc-500">{m.sender}</p>}
                  <span
                    className={`inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-1.5 text-sm ${
                      m.mine ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-100"
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
                placeholder="Message the room…"
                aria-label="Room message"
                maxLength={MESSAGE_MAX_LEN}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
              <button
                onClick={() => void send()}
                disabled={busy || !draft.trim()}
                className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                Send
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

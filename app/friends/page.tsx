"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { displayTime } from "@/lib/social/rules";
import { skillName } from "@/lib/graph/skills";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

interface Peer {
  id: string;
  peer_id: string;
  label?: string;
  created_at: string;
}

interface Duel {
  id: string;
  peer_id: string;
  peer: string;
  boss_id: string;
  skill: string;
  boss_status: string;
  link: string;
  status: string;
  created_at: string;
}

interface BoardRow {
  id: string;
  label: string;
  you: boolean;
  xp: number;
  streak: number;
  bosses: number;
}

interface Gift {
  id: string;
  sent: boolean;
  peer: string;
  xp_amount: number;
  item: string | null;
  created_at: string;
}

interface ApiError {
  error?: string;
  needsMigration?: boolean;
}

interface BossOpt {
  id: string;
  skill_tag: string;
  current_hp: number;
  max_hp: number;
  status: string;
  is_world: boolean;
}

const TABS = [
  { id: "friends", label: "Friends" },
  { id: "duels", label: "Duels" },
  { id: "board", label: "Ranks" },
  { id: "gifts", label: "Gifts" },
  { id: "safety", label: "Safety" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function errMsg(data: ApiError | null, fallback: string): string {
  if (data?.needsMigration) return "__migration__";
  return typeof data?.error === "string" ? data.error : fallback;
}

async function api(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(path, init);
  return ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
}

function FriendsInner() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [friends, setFriends] = useState<Peer[]>([]);
  const [incoming, setIncoming] = useState<Peer[]>([]);
  const [outgoing, setOutgoing] = useState<Peer[]>([]);
  const [duelsIn, setDuelsIn] = useState<Duel[]>([]);
  const [duelsOut, setDuelsOut] = useState<Duel[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [sent, setSent] = useState<Gift[]>([]);
  const [received, setReceived] = useState<Gift[]>([]);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [msg, setMsg] = useState("");
  const [bump, setBump] = useState(0);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<TabId>("friends");
  const [codeState, setCodeState] = useState<"loading" | "ready" | "error">("loading");
  const [bosses, setBosses] = useState<BossOpt[] | null>(null);
  const [bossesError, setBossesError] = useState("");

  const [addCode, setAddCode] = useState(() => (params.get("code") ?? "").trim().toUpperCase());
  const [duelTo, setDuelTo] = useState("");
  const [duelBoss, setDuelBoss] = useState("");
  const [giftTo, setGiftTo] = useState("");
  const [giftXp, setGiftXp] = useState(5);
  const [giftItem, setGiftItem] = useState("");
  const [reportPeer, setReportPeer] = useState("");
  const [reportReason, setReportReason] = useState("Spam");
  const [reportDetails, setReportDetails] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [codeRes, frRes, chRes, lbRes, gRes, abRes] = await Promise.all([
          api("/api/social/code"),
          api("/api/social/friends"),
          api("/api/social/challenges"),
          api("/api/social/leaderboard"),
          api("/api/social/gifts"),
          api("/api/arena/active-bosses"),
        ]);
        if (!alive) return;
        const all = [codeRes, frRes, chRes, lbRes, gRes] as ApiError[];
        if (all.some((d) => d.needsMigration)) {
          setNeedsMigration(true);
          return;
        }
        if (typeof codeRes.code === "string") setCode(codeRes.code);
        setCodeState("ready");
        setFriends(Array.isArray(frRes.friends) ? (frRes.friends as Peer[]) : []);
        setIncoming(Array.isArray(frRes.incoming) ? (frRes.incoming as Peer[]) : []);
        setOutgoing(Array.isArray(frRes.outgoing) ? (frRes.outgoing as Peer[]) : []);
        setDuelsIn(Array.isArray(chRes.incoming) ? (chRes.incoming as Duel[]) : []);
        setDuelsOut(Array.isArray(chRes.outgoing) ? (chRes.outgoing as Duel[]) : []);
        setBoard(Array.isArray(lbRes.rows) ? (lbRes.rows as BoardRow[]) : []);
        setSent(Array.isArray(gRes.sent) ? (gRes.sent as Gift[]) : []);
        setReceived(Array.isArray(gRes.received) ? (gRes.received as Gift[]) : []);
        setBosses(Array.isArray(abRes.bosses) ? (abRes.bosses as BossOpt[]) : []);
      } catch {
        if (!alive) return;
        setMsg("Could not load friends. Reload to retry.");
        setCodeState("error");
        setBossesError("Could not load live bosses.");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [bump]);

  function fail(e: unknown) {
    const m = e instanceof Error ? e.message : "Request failed.";
    if (m === "__migration__") {
      setNeedsMigration(true);
      return;
    }
    setMsg(m);
  }

  async function run(key: string, path: string, body: unknown, done: string, method = "POST") {
    if (busy) return;
    setBusy(key);
    setMsg("");
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as ApiError | null;
      if (!res.ok) throw new Error(errMsg(data, "Request failed."));
      if (data?.needsMigration) throw new Error("__migration__");
      setMsg(done);
      setBump((b) => b + 1);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  async function copyInvite() {
    const link = `${window.location.origin}/friends?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setMsg("Invite link copied — send it to a friend.");
    } catch {
      setMsg(`Copy this link: ${link}`);
    }
  }

  const knownPeers = [
    ...friends.map((f) => ({ id: f.peer_id, label: f.label ?? f.peer_id })),
    ...duelsIn.map((d) => ({ id: d.peer_id, label: d.peer })),
  ].filter((p, i, arr) => arr.findIndex((q) => q.id === p.id) === i);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader
        kicker="Squad up"
        title="Friends"
        sub="Add friends by code, duel their bosses, and compare progress. Strangers can only send you a friend request — never messages."
      />

      {needsMigration && (
        <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Friends need a database update (migration 0006) — ask the site owner to run it in
          Supabase.
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Your friend code</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {codeState === "loading" ? (
            <code
              role="status"
              aria-label="Loading your friend code"
              className="animate-pulse rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-lg font-bold tracking-widest text-zinc-500"
            >
              ……
            </code>
          ) : codeState === "error" ? (
            <p className="text-sm text-red-400" role="alert">
              Could not load your code.{" "}
              <button
                onClick={() => {
                  setCodeState("loading");
                  setBossesError("");
                  setBump((b) => b + 1);
                }}
                className="font-bold underline hover:text-red-300"
              >
                Retry
              </button>
            </p>
          ) : code ? (
            <>
              <code className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-lg font-bold tracking-widest text-amber-300">
                {code}
              </code>
              <button
                onClick={() => void copyInvite()}
                disabled={!code || needsMigration}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                Copy invite link
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              No code yet —{" "}
              <button
                onClick={() => {
                  setCodeState("loading");
                  setBump((b) => b + 1);
                }}
                className="font-bold text-amber-300 underline"
              >
                reload to mint one
              </button>
              .
            </p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={addCode}
            onChange={(e) => setAddCode(e.target.value.toUpperCase())}
            placeholder="Enter a friend code"
            aria-label="Friend code"
            maxLength={16}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm tracking-widest text-zinc-100"
          />
          <button
            onClick={() => void run("add", "/api/social/friends", { code: addCode }, "Friend request sent.")}
            disabled={busy !== "" || needsMigration || !addCode.trim()}
            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy === "add" ? "…" : "Add"}
          </button>
        </div>
      </section>

      {msg && <p className="mt-3 text-sm text-amber-300">{msg}</p>}

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-full border border-zinc-800 bg-zinc-900/60 p-1" role="tablist" aria-label="Friends sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "friends" && (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">My friends ({friends.length})</p>
        {friends.length === 0 && (
          <p className="mt-2 text-sm text-zinc-500">No friends yet — share your code above.</p>
        )}
        <ul className="mt-2 space-y-2">
          {friends.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{f.label}</span>
              <Link
                href={`/chat?with=${f.peer_id}`}
                className="rounded-md bg-sky-500 px-3 py-1 text-xs font-bold text-black hover:bg-sky-400"
              >
                Chat
              </Link>
              <button
                onClick={() => void run(`rm-${f.id}`, "/api/social/friends", { friend_id: f.peer_id }, "Friend removed.", "DELETE")}
                disabled={busy !== ""}
                className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Remove
              </button>
              <button
                onClick={() => void run(`bl-${f.id}`, "/api/social/friends/block", { player_id: f.peer_id, action: "block" }, "Player blocked.")}
                disabled={busy !== ""}
                className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-red-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Block
              </button>
            </li>
          ))}
        </ul>
        {incoming.length > 0 && (
          <>
            <p className="mt-4 text-sm font-semibold text-zinc-200">Requests for you</p>
            <ul className="mt-2 space-y-2">
              {incoming.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{r.label}</span>
                  <button
                    onClick={() => void run(`ac-${r.id}`, "/api/social/friends/respond", { request_id: r.id, action: "accept" }, "Friend added.")}
                    disabled={busy !== ""}
                    className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => void run(`dc-${r.id}`, "/api/social/friends/respond", { request_id: r.id, action: "decline" }, "Request declined.")}
                    disabled={busy !== ""}
                    className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {outgoing.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500">
            Waiting on: {outgoing.map((r) => r.label).join(", ")}
          </p>
        )}
      </section>
      )}

      {tab === "duels" && (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Boss duels</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Friend
            <select
              value={duelTo}
              onChange={(e) => setDuelTo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Pick a friend…</option>
              {friends.map((f) => (
                <option key={f.id} value={f.peer_id}>{f.label}</option>
              ))}
            </select>
          </label>
          <div className="text-xs text-zinc-400">
            <label htmlFor="duel-boss" className="block">
              Boss (live from the arena)
            </label>
            {bosses === null ? (
              bossesError ? (
                <p role="alert" className="mt-1 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {bossesError}{" "}
                  <button onClick={() => { setBossesError(""); setBump((b) => b + 1); }} className="font-bold underline">
                    Retry
                  </button>
                </p>
              ) : (
                <p role="status" className="mt-1 animate-pulse rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-500">
                  Loading live bosses…
                </p>
              )
            ) : bosses.length === 0 ? (
              <p className="mt-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-500">
                No live bosses — <Link href="/scan" className="font-bold text-amber-300 underline">scan to summon one</Link>.
              </p>
            ) : (
              <select
                id="duel-boss"
                value={duelBoss}
                onChange={(e) => setDuelBoss(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Pick a live boss…</option>
                {bosses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {skillName(b.skill_tag)} · HP {b.current_hp}/{b.max_hp}{b.is_world ? " · world" : ""} · {b.status}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            setDuelBoss("");
            void run("duel", "/api/social/challenges", { to: duelTo, boss_id: duelBoss }, "Duel invite sent.");
          }}
          disabled={busy !== "" || needsMigration || !duelTo || !duelBoss}
          className="mt-3 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-black hover:bg-violet-400 disabled:opacity-50"
        >
          {busy === "duel" ? "…" : "Challenge to a duel"}
        </button>
        {duelsIn.length > 0 && (
          <ul className="mt-3 space-y-2">
            {duelsIn.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-zinc-100">
                  {d.peer} challenged you ({d.skill}, {d.boss_status})
                </span>
                {d.status === "PENDING" ? (
                  <>
                    <button
                      onClick={() => void run(`da-${d.id}`, "/api/social/challenges/respond", { challenge_id: d.id, action: "accept" }, "Duel accepted — good luck!")}
                      disabled={busy !== ""}
                      className="rounded-md bg-emerald-500 px-3 py-1 text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => void run(`dd-${d.id}`, "/api/social/challenges/respond", { challenge_id: d.id, action: "decline" }, "Duel declined.")}
                      disabled={busy !== ""}
                      className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-zinc-500">{d.status}</span>
                )}
                <Link href={d.link} className="rounded-md bg-violet-500 px-3 py-1 text-xs font-bold text-black hover:bg-violet-400">
                  Fight →
                </Link>
              </li>
            ))}
          </ul>
        )}
        {duelsOut.length > 0 && (
          <ul className="mt-3 space-y-2">
            {duelsOut.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-zinc-400">
                  You → {d.peer} ({d.skill}) · {d.status}
                </span>
                <Link href={d.link} className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800">
                  Open boss →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {tab === "board" && (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Friends leaderboard</p>
        {board.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No rankings yet."
              body="Slay bosses and add friends — your circle's rankings land here."
              actionLabel="Enter the arena"
              actionHref="/arena"
            />
          </div>
        ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="py-1 pr-3">Hunter</th>
                <th className="py-1 pr-3">XP</th>
                <th className="py-1 pr-3">Streak</th>
                <th className="py-1">Bosses</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800 text-zinc-100">
                  <td className="py-1 pr-3">{r.label}{r.you ? " (you)" : ""}</td>
                  <td className="py-1 pr-3 font-bold text-amber-300">{r.xp}</td>
                  <td className="py-1 pr-3">{r.streak}d</td>
                  <td className="py-1">{r.bosses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
      )}

      {tab === "gifts" && (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Send a gift</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="block text-xs text-zinc-400">
            Friend
            <select
              value={giftTo}
              onChange={(e) => setGiftTo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Pick a friend…</option>
              {friends.map((f) => (
                <option key={f.id} value={f.peer_id}>{f.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            XP (0-50)
            <input
              type="number"
              min={0}
              max={50}
              value={giftXp}
              onChange={(e) => setGiftXp(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Item label (optional)
            <input
              value={giftItem}
              onChange={(e) => setGiftItem(e.target.value)}
              placeholder="e.g. hint token"
              maxLength={40}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
        </div>
        <button
          onClick={() => {
            setGiftItem("");
            void run("gift", "/api/social/gifts", { to: giftTo, xp_amount: giftXp, item: giftItem }, "Gift sent.");
          }}
          disabled={busy !== "" || needsMigration || !giftTo}
          className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {busy === "gift" ? "…" : "Send gift"}
        </button>
        {received.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-zinc-300">
            {received.slice(0, 5).map((g) => (
              <li key={g.id}>
                🎁 {g.peer} sent you {g.xp_amount > 0 ? `${g.xp_amount} XP` : ""}{g.xp_amount > 0 && g.item ? " + " : ""}{g.item ?? ""}{" "}
                <span className="text-zinc-500">· {displayTime(g.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {sent.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            {sent.slice(0, 5).map((g) => (
              <li key={g.id}>
                You sent {g.peer} {g.xp_amount > 0 ? `${g.xp_amount} XP` : ""}{g.xp_amount > 0 && g.item ? " + " : ""}{g.item ?? ""}{" "}
                <span className="text-zinc-600">· {displayTime(g.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {tab === "safety" && (
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Safety</p>
        <p className="mt-1 text-xs text-zinc-500">
          Blocked players cannot message you 1-1. Group rooms are shared — leave any room you share with them. Reports go to the site owner.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Player
            <select
              value={reportPeer}
              onChange={(e) => setReportPeer(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Pick a player…</option>
              {knownPeers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Reason
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              {["Spam", "Harassment", "Cheating", "Inappropriate name", "Other"].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <input
          value={reportDetails}
          onChange={(e) => setReportDetails(e.target.value)}
          placeholder="Details (optional, max 500)"
          maxLength={500}
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <button
          onClick={() => {
            setReportDetails("");
            void run("report", "/api/social/report", { reported_id: reportPeer, reason: reportReason, details: reportDetails }, "Report sent. Thanks for keeping Arena safe.");
          }}
          disabled={busy !== "" || needsMigration || !reportPeer}
          className="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-900/40 disabled:opacity-50"
        >
          {busy === "report" ? "…" : "Send report"}
        </button>
      </section>
      )}
    </main>
  );
}

export default function FriendsPage() {
  return (
    <Suspense
      fallback={<main className="mx-auto max-w-2xl px-4 py-10 text-sm text-zinc-400">Loading friends…</main>}
    >
      <FriendsInner />
    </Suspense>
  );
}

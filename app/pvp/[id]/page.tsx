"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { PVP_START_HP } from "@/lib/game/pvp";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Fighter = {
  player_id: string;
  name: string;
  side: "A" | "B";
  correct: number;
  misses: number;
  hp: number;
  answered: number[];
};
type RoomView = {
  room_id: string;
  skill_tag: string;
  skill_name: string;
  status: string;
  you: string;
  your_side: "A" | "B" | null;
  fighters: Fighter[];
  finished: boolean;
  winner_side: "A" | "B" | null;
  draw: boolean;
  questions: Array<{ level: number; prompt_latex: string; hint: string }>;
};

function HpMini({ hp, side }: { hp: number; side: "A" | "B" }) {
  const pct = Math.max(0, Math.min(100, (hp / PVP_START_HP) * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={Math.max(0, hp)} aria-valuemax={PVP_START_HP} aria-label="Fighter HP">
      <div className={`h-full rounded-full ${side === "A" ? "bg-red-400" : "bg-sky-400"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PvpInner() {
  const { id } = useParams<{ id: string }>();
  const [room, setRoom] = useState<RoomView | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/pvp/" + id);
      if (!r.ok) throw new Error(await readApiError(r, "Room lookup failed."));
      setRoom(await readApiJson<RoomView>(r, "Room lookup failed."));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Room lookup failed.");
    }
  }, [id]);

  useEffect(() => {
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (room?.finished) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [load, room?.finished]);

  async function claim(side: "A" | "B") {
    if (claiming) return;
    setClaiming(true);
    try {
      const r = await fetch(`/api/pvp/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Claim failed."));
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setClaiming(false);
    }
  }

  async function attack() {
    if (!room || busyRef.current || room.finished || !room.your_side) return;
    if (answer.trim() === "") {
      setMsg("Enter a number.");
      return;
    }
    const n = Number(answer);
    if (!Number.isFinite(n)) {
      setMsg("Enter a number.");
      return;
    }
    const me = room.fighters.find((f) => f.player_id === room.you);
    const qi = me ? me.answered.findIndex((a) => a === 0) : 0;
    if (qi < 0) {
      setMsg("All 5 answered — waiting on the other side.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`/api/pvp/${id}/attack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_index: qi, answer: n }),
      });
      const d = await readApiJson<{ correct: boolean; room: RoomView | null }>(r, "Attack failed.");
      if (d.room) setRoom(d.room);
      if (d.correct) {
        setAnswer("");
        setMsg("Hit! The enemy side bleeds.");
      } else {
        setMsg("Miss. That one hurt you.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Attack failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function copyLink() {
    const url = window.location.href;
    try {
      void navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      window.prompt("Copy room link:", url);
    }
  }

  if (!room) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
        <div className="arena-shimmer h-40 rounded-2xl" role="status" aria-label="Loading room" />
        {msg ? (
          <p role="alert" className="text-center text-sm text-red-400">
            {msg}
          </p>
        ) : null}
        <Link href="/pvp" className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
          Back to lobby
        </Link>
      </main>
    );
  }

  const me = room.fighters.find((f) => f.player_id === room.you);
  const myIdx = me ? me.answered.findIndex((a) => a === 0) : 0;
  const q = myIdx >= 0 ? room.questions[myIdx] : null;
  const sideA = room.fighters.filter((f) => f.side === "A");
  const sideB = room.fighters.filter((f) => f.side === "B");
  const msgColor = msg.startsWith("Hit") ? "text-emerald-400 font-semibold" : msg.startsWith("Miss") ? "text-red-400" : "text-zinc-400";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="PVP duel"
        title={room.skill_name}
        right={
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {copied ? "Copied!" : "Copy invite"}
          </button>
        }
      />
      {room.finished ? (
        <div className="arena-pop arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-amber-300 uppercase">Duel over</p>
          <p className="font-display mt-1 text-2xl font-black text-zinc-50">
            {room.draw
              ? "Draw — both sides fell."
              : room.winner_side
                ? `Side ${room.winner_side} wins.`
                : "Room closed."}
          </p>
          <Link href="/pvp" className="arena-btn-primary mt-3 inline-block rounded-full px-5 py-2 text-sm font-bold text-white">
            Rematch in lobby
          </Link>
        </div>
      ) : null}
      {!room.your_side && !room.finished ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Pick your side.</p>
          <p className="text-sm text-zinc-400">First pick locks — no switching mid-duel.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void claim("A")}
              disabled={claiming}
              className="rounded-full bg-red-500/20 px-6 py-2.5 font-bold text-red-200 disabled:opacity-40"
            >
              Side A{sideA.length > 0 ? ` (${sideA.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => void claim("B")}
              disabled={claiming}
              className="rounded-full bg-sky-500/20 px-6 py-2.5 font-bold text-sky-200 disabled:opacity-40"
            >
              Side B{sideB.length > 0 ? ` (${sideB.length})` : ""}
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["A", sideA],
            ["B", sideB],
          ] as const
        ).map(([side, list]) => (
          <div key={side} className="arena-card rounded-2xl p-4">
            <p className={`text-xs font-bold tracking-widest uppercase ${side === "A" ? "text-red-300" : "text-sky-300"}`}>
              Side {side}{" "}
              {room.winner_side === side ? "· winner" : ""}
            </p>
            {list.length === 0 ? <p className="mt-1 text-xs text-zinc-500">Waiting…</p> : null}
            {list.map((f) => (
              <div key={f.player_id} className="mt-2">
                <div className="flex items-baseline justify-between gap-1 text-xs">
                  <span className={`truncate font-bold ${f.player_id === room.you ? "text-zinc-100" : "text-zinc-400"}`}>
                    {f.player_id === room.you ? "You" : f.name}
                  </span>
                  <span className="arena-num shrink-0 text-zinc-500">
                    {Math.max(0, f.hp)} · ✓{f.correct} ✗{f.misses}
                  </span>
                </div>
                <HpMini hp={f.hp} side={side} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {q && room.your_side && !room.finished ? (
        <div className="arena-enter arena-card flex flex-col gap-3 rounded-2xl p-5">
          <p className="arena-num text-sm text-zinc-400">
            Q{myIdx + 1}/5 · <span className="font-bold text-amber-300">Lv {q.level}</span>
          </p>
          <MathText text={q.prompt_latex} className="overflow-x-auto text-xl text-zinc-100" />
          <p className="text-sm text-zinc-400"><span aria-hidden="true">💡</span> Hint: {q.hint}</p>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void attack();
              }}
              placeholder="Your numeric answer"
              aria-label="Your numeric answer"
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2.5 text-lg text-zinc-100 placeholder:text-zinc-600"
            />
            <button
              onClick={attack}
              disabled={busy}
              className="arena-btn-primary shrink-0 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "…" : "Strike"}
            </button>
          </div>
          {msg ? <p className={`text-sm ${msgColor}`}>{msg}</p> : null}
        </div>
      ) : null}
      {!q && room.your_side && !room.finished ? (
        <div className="arena-card rounded-2xl p-5 text-center">
          <p className="text-sm text-zinc-300">All 5 answered — the other side is still swinging.</p>
        </div>
      ) : null}
    </main>
  );
}

export default function PvpRoomPage() {
  return (
    <Suspense>
      <PvpInner />
    </Suspense>
  );
}

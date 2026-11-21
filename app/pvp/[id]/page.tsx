"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStatus } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import { BulbIcon, CheckIcon, XIcon } from "@/components/ui/icons";
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
    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={Math.max(0, hp)} aria-valuemax={PVP_START_HP} aria-label="Máu của đấu thủ">
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
      if (!r.ok) throw new Error(await readApiError(r, "Không tìm được phòng."));
      setRoom(await readApiJson<RoomView>(r, "Không tìm được phòng."));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không tìm được phòng.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Chọn phe thất bại."));
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Chọn phe thất bại.");
    } finally {
      setClaiming(false);
    }
  }

  async function attack() {
    if (!room || busyRef.current || room.finished || !room.your_side) return;
    if (answer.trim() === "") {
      setMsg("Nhập một số.");
      return;
    }
    const n = Number(answer);
    if (!Number.isFinite(n)) {
      setMsg("Nhập một số.");
      return;
    }
    const me = room.fighters.find((f) => f.player_id === room.you);
    const qi = me ? me.answered.findIndex((a) => a === 0) : 0;
    if (qi < 0) {
      setMsg("Đã trả lời cả 5 câu — chờ phe bên kia.");
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
      const d = await readApiJson<{ correct: boolean; room: RoomView | null }>(r, "Đánh thất bại.");
      if (d.room) setRoom(d.room);
      if (d.correct) {
        setAnswer("");
        setMsg("Trúng! Phe địch mất máu.");
      } else {
        setMsg("Trượt. Đòn này làm bạn mất máu.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Đánh thất bại.");
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
      window.prompt("Chép link phòng:", url);
    }
  }

  if (!room) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
        <div className="arena-shimmer h-40 rounded-2xl" role="status" aria-label="Đang tải phòng" />
        {msg ? (
          <p role="alert" className="text-center text-sm text-red-400">
            {msg}
          </p>
        ) : null}
        <Link href="/pvp" className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
          Về sảnh
        </Link>
      </main>
    );
  }

  const me = room.fighters.find((f) => f.player_id === room.you);
  const myIdx = me ? me.answered.findIndex((a) => a === 0) : 0;
  const q = myIdx >= 0 ? room.questions[myIdx] : null;
  const sideA = room.fighters.filter((f) => f.side === "A");
  const sideB = room.fighters.filter((f) => f.side === "B");
  const msgColor = msg.startsWith("Trúng") ? "text-emerald-400 font-semibold" : msg.startsWith("Trượt") ? "text-red-400" : "text-zinc-400";

  const hpA = sideA.reduce((a, f) => a + Math.max(0, f.hp), 0);
  const hpB = sideB.reduce((a, f) => a + Math.max(0, f.hp), 0);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStatus label={room.finished ? "Trận đã xong" : !room.your_side ? "Chọn phe" : "Đang đấu"}>
        <span className="text-red-300">A {hpA}</span>
        <span aria-hidden="true" className="text-zinc-600">—</span>
        <span className="text-sky-300">B {hpB}</span>
      </HeroStatus>
      <PageHeader
        kicker="Đấu PvP"
        title={room.skill_name}
        right={
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {copied ? "Đã chép!" : "Chép link mời"}
          </button>
        }
      />
      {room.finished ? (
        <div className="arena-pop arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-amber-300">Trận đấu xong</p>
          <p className="font-display mt-1 text-2xl font-black text-zinc-50">
            {room.draw
              ? "Hòa — cả hai phe cùng ngã."
              : room.winner_side
                ? `Phe ${room.winner_side} thắng.`
                : "Phòng đã đóng."}
          </p>
          <Link href="/pvp" className="arena-btn-primary mt-3 inline-block rounded-full px-5 py-2 text-sm font-bold text-white">
            Đấu lại ở sảnh
          </Link>
        </div>
      ) : null}
      {!room.your_side && !room.finished ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Chọn phe của bạn.</p>
          <p className="text-sm text-zinc-400">Chọn là chốt — không đổi phe giữa trận.</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void claim("A")}
              disabled={claiming}
              className="rounded-full bg-red-500/20 px-6 py-2.5 font-bold text-red-200 disabled:opacity-40"
            >
              Phe A{sideA.length > 0 ? ` (${sideA.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => void claim("B")}
              disabled={claiming}
              className="rounded-full bg-sky-500/20 px-6 py-2.5 font-bold text-sky-200 disabled:opacity-40"
            >
              Phe B{sideB.length > 0 ? ` (${sideB.length})` : ""}
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
            <p className={`text-xs font-bold tracking-widest ${side === "A" ? "text-red-300" : "text-sky-300"}`}>
              Phe {side}{" "}
              {room.winner_side === side ? "— thắng" : ""}
            </p>
            {list.length === 0 ? <p className="mt-1 text-xs text-zinc-500">Đang chờ…</p> : null}
            {list.map((f) => (
              <div key={f.player_id} className="mt-2">
                <div className="flex items-baseline justify-between gap-1 text-xs">
                  <span className={`truncate font-bold ${f.player_id === room.you ? "text-zinc-100" : "text-zinc-400"}`}>
                    {f.player_id === room.you ? "Bạn" : f.name}
                  </span>
                  <span className="arena-num inline-flex shrink-0 items-center gap-1 text-zinc-500 tabular-nums">
                    {Math.max(0, f.hp)} — <CheckIcon className="h-3 w-3 text-emerald-400" />{f.correct} <XIcon className="h-3 w-3 text-red-400" />{f.misses}
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
          <p className="arena-num text-sm tabular-nums text-zinc-400">
            Câu {myIdx + 1}/5 — <span className="font-bold text-amber-300">Cấp {q.level}</span>
          </p>
          <MathText text={q.prompt_latex} className="overflow-x-auto text-xl text-zinc-100" />
          <p className="flex items-center gap-1.5 text-sm text-zinc-400"><BulbIcon className="h-4 w-4 text-amber-300" /> Gợi ý: {q.hint}</p>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void attack();
              }}
              placeholder="Đáp án của bạn (nhập số)"
              aria-label="Đáp án của bạn, nhập số"
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2.5 text-lg text-zinc-100 placeholder:text-zinc-600"
            />
            <button
              onClick={attack}
              disabled={busy}
              className="arena-btn-primary shrink-0 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "Đang đánh…" : "Đánh"}
            </button>
          </div>
          {msg ? <p role="status" className={`text-sm ${msgColor}`}>{msg}</p> : null}
        </div>
      ) : null}
      {!q && room.your_side && !room.finished ? (
        <div className="arena-card rounded-2xl p-5 text-center">
          <p className="text-sm text-zinc-300">Đã trả lời cả 5 câu — phe bên kia vẫn đang đánh.</p>
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

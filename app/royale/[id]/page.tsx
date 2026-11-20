"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStatus } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Q = { no: number; prompt_latex: string; options: string[]; tier: "verified" | "draft" };
type View = {
  id: string;
  section: { id: string; name: string };
  status: string;
  round: number;
  totalRounds: number;
  round_ends_at: string | null;
  winner: string | null;
  winner_short: string | null;
  youWon: boolean;
  isCreator: boolean;
  you: { alive: boolean; score: number; answered: number } | null;
  roster: Array<{ short: string; alive: boolean; score: number; you: boolean }>;
  question: Q | null;
};

const LETTERS = ["A", "B", "C", "D"];

function RoyaleArenaInner() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [view, setView] = useState<View | null>(null);
  const [picked, setPicked] = useState(-1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/royale/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(await readApiError(r, "Không tìm được phòng."));
      const d = await readApiJson<View>(r, "Không tìm được phòng.");
      setView((v) => {
        if (!v || v.round !== d.round) setPicked(-1);
        return d;
      });
      setNow(Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tìm được phòng.");
    }
  }, [id]);

  const donePolling = view?.status === "finished";
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    if (!id || donePolling) return;
    const t = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 2000);
    return () => clearInterval(t);
  }, [id, load, donePolling]);

  async function join() {
    if (busy || !id) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/royale/${encodeURIComponent(id)}/join`, { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Vào phòng thất bại."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vào phòng thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (busy || !id) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/royale/${encodeURIComponent(id)}/start`, { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Bắt đầu thất bại."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bắt đầu thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function answer(k: number) {
    if (busy || !view || !view.you?.alive || view.you.answered >= view.round) return;
    setPicked(k);
    setBusy(true);
    try {
      const r = await fetch(`/api/royale/${encodeURIComponent(id)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: k }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Trả lời thất bại."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trả lời thất bại.");
    } finally {
      setBusy(false);
    }
  }

  const finished = view?.status === "finished";
  const ends = view?.round_ends_at ? new Date(view.round_ends_at).getTime() : 0;
  const left = ends > 0 ? Math.max(0, Math.ceil((ends - now) / 1000)) : 0;
  const answered = view?.you ? view.you.answered >= view.round : false;

  // ARIA radio keyboard pattern (mirrors friends tabs): arrows move focus,
  // Home/End jump. Focus only — answering still needs a press, so nobody
  // submits by accident while browsing options.
  function onOptionKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const btns = Array.from(e.currentTarget.querySelectorAll('[role="radio"]')) as HTMLElement[];
    if (btns.length === 0) return;
    const cur = btns.indexOf(document.activeElement as HTMLElement);
    const at = cur < 0 ? 0 : cur;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (at + 1) % btns.length
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (at - 1 + btns.length) % btns.length
      : e.key === "Home" ? 0
      : e.key === "End" ? btns.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    btns[next]?.focus();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStatus label={finished ? "Trận đã xong" : view?.status === "lobby" ? "Sảnh chờ" : "Đang đấu"}>
        {view ? `Vòng ${Math.min(view.round + 1, view.totalRounds)}/${view.totalRounds} — ${view.roster.filter((p) => p.alive).length} còn lại` : "Đang tải…"}
      </HeroStatus>
      <PageHeader
        kicker="Đấu sinh tồn"
        title={<>{view?.section.name ?? "…"} <span className="arena-title">sinh tồn</span></>}
        sub={view ? `${view.roster.length} người trong phòng` : "Đang tải phòng…"}
        right={
          view?.status === "live" && !finished ? (
            <span role="timer" aria-label="Thời gian còn lại của vòng" className={`arena-num shrink-0 font-mono text-sm tabular-nums ${left <= 5 ? "font-bold text-red-400" : "text-zinc-400"}`}>
              {left} giây
            </span>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      {view?.status === "lobby" ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="text-sm text-zinc-300">Mã phòng: <span className="arena-num font-mono text-amber-300">{view.id}</span></p>
          {!view.you ? (
            <button type="button" onClick={() => void join()} disabled={busy} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40">
              {busy ? "Đang vào…" : "Vào phòng"}
            </button>
          ) : null}
          {view.isCreator ? (
            <button type="button" onClick={() => void start()} disabled={busy || view.roster.length < 2} className="arena-btn-ghost rounded-full px-6 py-2.5 font-bold text-zinc-200 disabled:opacity-40">
              Bắt đầu ({view.roster.length}/8)
            </button>
          ) : (
            <p className="text-sm tabular-nums text-zinc-400">Chờ chủ phòng bắt đầu… ({view.roster.length}/8)</p>
          )}
        </div>
      ) : null}
      {finished && view ? (
        <div role="status" className="arena-enter arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-zinc-400">
            {view.youWon ? "Thắng" : "Thua"}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Người thắng <span className="arena-num font-mono font-bold text-amber-300">{view.winner_short ?? "–"}</span>
          </p>
          <Link href="/royale" className="arena-btn-primary mt-3 inline-block rounded-full px-6 py-2.5 font-bold text-white">
            Phòng mới
          </Link>
        </div>
      ) : null}
      {view ? (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Danh sách người chơi">
          {view.roster.map((p, i) => (
            <span key={`${p.short}-${i}`} className={`arena-num rounded-full px-3 py-1 text-sm ${p.alive ? "arena-btn-ghost text-zinc-200" : "text-zinc-600 line-through"}`}>
              {p.you ? "Bạn" : p.short} — {p.score}
            </span>
          ))}
        </div>
      ) : null}
      {view?.status === "live" && !finished && view.question && view.you?.alive && !answered ? (
        <div className="arena-card rounded-2xl p-5">
          <p className="text-xs text-zinc-500">
            Câu {view.question.no} — {view.section.name} —{" "}
            {view.question.tier === "verified" ? (
              <span className="font-bold text-emerald-300">Đã kiểm duyệt</span>
            ) : (
              <span className="font-bold text-amber-300">Bản nháp AI</span>
            )}
          </p>
          <MathText text={view.question.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`Các đáp án cho vòng ${view.round + 1}`} onKeyDown={onOptionKeyDown}>
            {view.question.options.map((o, k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={picked === k}
                onClick={() => void answer(k)}
                disabled={busy}
                className={`flex items-center gap-3 rounded-xl px-4 py-2 text-left text-zinc-100 disabled:opacity-60 ${picked === k ? "arena-btn-primary" : "arena-btn-ghost"}`}
              >
                <span className="arena-num font-bold">{LETTERS[k]}</span>
                <MathText text={o} className="min-w-0 flex-1" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {view?.status === "live" && !finished && (!view.you?.alive ? true : answered) ? (
        <p className="text-center text-sm text-zinc-400" role="status">
          {!view.you?.alive ? "Bạn bị loại — đang xem…" : "Đã chốt — chờ vòng đấu…"}
        </p>
      ) : null}
    </main>
  );
}

export default function RoyaleArenaPage() {
  return (
    <Suspense>
      <RoyaleArenaInner />
    </Suspense>
  );
}

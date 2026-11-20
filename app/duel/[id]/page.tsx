"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Q = { no: number; prompt_latex: string; options: string[]; tier: "verified" | "draft" };
type Side = { done: boolean; score: number | null; elo: { rating: number; games: number } | null };
type View = {
  id: string;
  exam: string;
  section: { id: string; name: string };
  status: string;
  winner: "p1" | "p2" | "draw" | null;
  you: "p1" | "p2" | null;
  p1: Side;
  p2: Side | null;
  paper: Q[];
};

const LETTERS = ["A", "B", "C", "D"];

function DuelBattleInner() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [view, setView] = useState<View | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);

  async function join() {
    if (joining || !id) return;
    setJoining(true);
    setError("");
    try {
      const r = await fetch(`/api/duel/${encodeURIComponent(id)}/join`, { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Vào trận thất bại."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vào trận thất bại.");
    } finally {
      setJoining(false);
    }
  }

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/duel/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(await readApiError(r, "Không tìm được trận đấu."));
      const d = await readApiJson<View>(r, "Không tìm được trận đấu.");
      setView(d);
      setPicked((p) => (p.length === d.paper.length ? p : d.paper.map(() => -1)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tìm được trận đấu.");
    }
  }, [id]);

  const donePolling = view?.status === "finished";
  useEffect(() => {
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    if (!id || donePolling) return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [id, load, donePolling]);

  async function submit() {
    if (submitting || !view) return;
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(`/api/duel/${encodeURIComponent(id)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: picked }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Nộp bài thất bại."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nộp bài thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  const finished = view?.status === "finished";
  const mine = view?.you === "p1" ? view.p1 : view?.you === "p2" ? view.p2 : null;
  const foe = view?.you === "p1" ? view.p2 : view?.you === "p2" ? view.p1 : null;
  const answered = picked.filter((p) => p >= 0).length;

  // ARIA radio keyboard pattern (mirrors friends tabs): arrows move the answer
  // and focus, Home/End jump. Click keeps working as before.
  function onOptionKeyDown(e: React.KeyboardEvent<HTMLDivElement>, qIndex: number, count: number) {
    const cur = picked[qIndex] ?? -1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (cur + 1 + count) % count
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (cur - 1 + count) % count
      : e.key === "Home" ? 0
      : e.key === "End" ? count - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setPicked((p) => p.map((v, kk) => (kk === qIndex ? next : v)));
    const btn = e.currentTarget.querySelectorAll('[role="radio"]')[next] as HTMLElement | undefined;
    btn?.focus();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Thách đấu theo đề"
        title={<>{view?.section.name ?? "…"} <span className="arena-title">thách đấu</span></>}
        sub={view ? `Bạn là ${view.you === "p1" ? "Người chơi 1" : view.you === "p2" ? "Người chơi 2" : "khán giả"} — ELO ${mine?.elo?.rating ?? "–"}` : "Đang tải trận đấu…"}
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      {view && !view.p2 && !finished ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="text-sm text-zinc-300">Đang chờ đối thủ… gửi mã trận này cho bạn:</p>
          <p className="arena-num font-mono text-sm break-all text-amber-300">{view.id}</p>
          {!view.you ? (
            <button
              type="button"
              onClick={() => void join()}
              disabled={joining}
              className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40"
            >
              {joining ? "Đang vào…" : "Vào trận này"}
            </button>
          ) : null}
        </div>
      ) : null}
      {view && foe ? (
        <p className="text-center text-sm tabular-nums text-zinc-400" role="status">
          Đối thủ {foe.done ? <span className="font-bold text-emerald-300">đã xong{finished && foe.score !== null ? ` — ${foe.score}` : ""}</span> : <span className="font-bold text-zinc-300">đang đánh…</span>}
          {" — "}ELO {foe.elo?.rating ?? "–"}
        </p>
      ) : null}
      {finished && view ? (
        <div role="status" className="arena-enter arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-zinc-400">
            {view.winner === "draw" ? "Hòa" : view.winner === view.you ? "Thắng" : "Thua"}
          </p>
          <p className="mt-1 text-lg text-zinc-100">
            <span className="arena-num font-bold text-emerald-300">{view.p1.score ?? "–"}</span>
            {" — "}
            <span className="arena-num font-bold text-emerald-300">{view.p2?.score ?? "–"}</span>
          </p>
          <Link href="/duel" className="arena-btn-primary mt-3 inline-block rounded-full px-6 py-2.5 font-bold text-white">
            Đấu lại
          </Link>
        </div>
      ) : null}
      {view && !finished && mine && !mine.done && view.p2
        ? view.paper.map((q, i) => (
            <div key={q.no} className="arena-card rounded-2xl p-5">
              <p className="text-xs text-zinc-500">
                Câu {q.no} — {view.section.name} —{" "}
                {q.tier === "verified" ? (
                  <span className="font-bold text-emerald-300">Đã kiểm duyệt</span>
                ) : (
                  <span className="font-bold text-amber-300">Bản nháp AI</span>
                )}
              </p>
              <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
              <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={`Các đáp án cho câu ${q.no}`} onKeyDown={(e) => onOptionKeyDown(e, i, q.options.length)}>
                {q.options.map((o, k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={picked[i] === k}
                    onClick={() => setPicked((p) => p.map((v, kk) => (kk === i ? k : v)))}
                    className={`flex items-center gap-3 rounded-xl px-4 py-2 text-left text-zinc-100 ${picked[i] === k ? "arena-btn-primary" : "arena-btn-ghost"}`}
                  >
                    <span className="arena-num font-bold">{LETTERS[k]}</span>
                    <MathText text={o} className="min-w-0 flex-1" />
                  </button>
                ))}
              </div>
            </div>
          ))
        : null}
      {view && !finished && mine && !mine.done && view.p2 ? (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="arena-btn-primary mx-auto rounded-full px-8 py-2.5 font-bold text-white disabled:opacity-40"
          >
            {submitting ? "Đang nộp…" : `Nộp ${answered}/${view.paper.length}`}
          </button>
          <p className="text-xs text-zinc-500">Câu chưa trả lời tính là sai.</p>
        </div>
      ) : null}
      {view && !finished && mine?.done ? (
        <p className="text-center text-sm text-zinc-400" role="status">Đã nộp — đang chờ đối thủ…</p>
      ) : null}
    </main>
  );
}

export default function DuelBattlePage() {
  return (
    <Suspense>
      <DuelBattleInner />
    </Suspense>
  );
}

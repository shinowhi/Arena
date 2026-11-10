"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
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
      if (!r.ok) throw new Error(await readApiError(r, "Room lookup failed."));
      const d = await readApiJson<View>(r, "Room lookup failed.");
      setView((v) => {
        if (!v || v.round !== d.round) setPicked(-1);
        return d;
      });
      setNow(Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Room lookup failed.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Join failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Join failed.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (busy || !id) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/royale/${encodeURIComponent(id)}/start`, { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Start failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start failed.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Answer failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Answer failed.");
    } finally {
      setBusy(false);
    }
  }

  const finished = view?.status === "finished";
  const ends = view?.round_ends_at ? new Date(view.round_ends_at).getTime() : 0;
  const left = ends > 0 ? Math.max(0, Math.ceil((ends - now) / 1000)) : 0;
  const answered = view?.you ? view.you.answered >= view.round : false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Battle royale"
        title={<>{view?.section.name ?? "…"} <span className="arena-title">arena</span></>}
        sub={view ? `Round ${Math.min(view.round + 1, view.totalRounds)}/${view.totalRounds} · ${view.roster.filter((p) => p.alive).length} alive` : "Loading room…"}
        right={
          view?.status === "live" && !finished ? (
            <span role="timer" aria-label="Round time left" className={`arena-num shrink-0 font-mono text-sm tabular-nums ${left <= 5 ? "font-bold text-red-400" : "text-zinc-400"}`}>
              {left}s
            </span>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      {view?.status === "lobby" ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="text-sm text-zinc-300">Room ID: <span className="arena-num font-mono text-amber-300">{view.id}</span></p>
          {!view.you ? (
            <button type="button" onClick={() => void join()} disabled={busy} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40">
              {busy ? "…" : "Join room"}
            </button>
          ) : null}
          {view.isCreator ? (
            <button type="button" onClick={() => void start()} disabled={busy || view.roster.length < 2} className="arena-btn-ghost rounded-full px-6 py-2.5 font-bold text-zinc-200 disabled:opacity-40">
              Start ({view.roster.length}/8)
            </button>
          ) : (
            <p className="text-sm text-zinc-400">Waiting for the creator to start… ({view.roster.length}/8)</p>
          )}
        </div>
      ) : null}
      {finished && view ? (
        <div role="status" className="arena-enter arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            {view.youWon ? "Victory" : "Game over"}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Winner <span className="arena-num font-mono font-bold text-amber-300">{view.winner_short ?? "–"}</span>
          </p>
          <Link href="/royale" className="arena-btn-primary mt-3 inline-block rounded-full px-6 py-2.5 font-bold text-white">
            New room
          </Link>
        </div>
      ) : null}
      {view ? (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Roster">
          {view.roster.map((p, i) => (
            <span key={`${p.short}-${i}`} className={`arena-num rounded-full px-3 py-1 text-sm ${p.alive ? "arena-btn-ghost text-zinc-200" : "text-zinc-600 line-through"}`}>
              {p.you ? "You" : p.short} · {p.score}
            </span>
          ))}
        </div>
      ) : null}
      {view?.status === "live" && !finished && view.question && view.you?.alive && !answered ? (
        <div className="arena-card rounded-2xl p-5">
          <p className="text-xs text-zinc-500">
            Q{view.question.no} · {view.section.name} ·{" "}
            {view.question.tier === "verified" ? (
              <span className="font-bold text-emerald-300">Verified</span>
            ) : (
              <span className="font-bold text-amber-300">AI draft</span>
            )}
          </p>
          <MathText text={view.question.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`Options for round ${view.round + 1}`}>
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
          {!view.you?.alive ? "You are out — spectating…" : "Locked in — waiting for the round…"}
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

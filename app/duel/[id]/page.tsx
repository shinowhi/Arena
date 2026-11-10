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
      if (!r.ok) throw new Error(await readApiError(r, "Join failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Join failed.");
    } finally {
      setJoining(false);
    }
  }

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/duel/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(await readApiError(r, "Duel lookup failed."));
      const d = await readApiJson<View>(r, "Duel lookup failed.");
      setView(d);
      setPicked((p) => (p.length === d.paper.length ? p : d.paper.map(() => -1)));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duel lookup failed.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Submit failed."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const finished = view?.status === "finished";
  const mine = view?.you === "p1" ? view.p1 : view?.you === "p2" ? view.p2 : null;
  const foe = view?.you === "p1" ? view.p2 : view?.you === "p2" ? view.p1 : null;
  const answered = picked.filter((p) => p >= 0).length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Exam duel"
        title={<>{view?.section.name ?? "…"} <span className="arena-title">duel</span></>}
        sub={view ? `You are ${view.you === "p1" ? "Player 1" : view.you === "p2" ? "Player 2" : "spectating"} · ELO ${mine?.elo?.rating ?? "–"}` : "Loading duel…"}
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      {view && !view.p2 && !finished ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="text-sm text-zinc-300">Waiting for an opponent… share this duel ID:</p>
          <p className="arena-num font-mono text-sm break-all text-amber-300">{view.id}</p>
          {!view.you ? (
            <button
              type="button"
              onClick={() => void join()}
              disabled={joining}
              className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40"
            >
              {joining ? "…" : "Join this duel"}
            </button>
          ) : null}
        </div>
      ) : null}
      {view && foe ? (
        <p className="text-center text-sm text-zinc-400" role="status">
          Foe {foe.done ? <span className="font-bold text-emerald-300">finished{finished && foe.score !== null ? ` · ${foe.score}` : ""}</span> : <span className="font-bold text-zinc-300">fighting…</span>}
          {" · "}ELO {foe.elo?.rating ?? "–"}
        </p>
      ) : null}
      {finished && view ? (
        <div role="status" className="arena-enter arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase">
            {view.winner === "draw" ? "Draw" : view.winner === view.you ? "Victory" : "Defeat"}
          </p>
          <p className="mt-1 text-lg text-zinc-100">
            <span className="arena-num font-bold text-emerald-300">{view.p1.score ?? "–"}</span>
            {" — "}
            <span className="arena-num font-bold text-emerald-300">{view.p2?.score ?? "–"}</span>
          </p>
          <Link href="/duel" className="arena-btn-primary mt-3 inline-block rounded-full px-6 py-2.5 font-bold text-white">
            Rematch
          </Link>
        </div>
      ) : null}
      {view && !finished && mine && !mine.done && view.p2
        ? view.paper.map((q, i) => (
            <div key={q.no} className="arena-card rounded-2xl p-5">
              <p className="text-xs text-zinc-500">
                Q{q.no} · {view.section.name} ·{" "}
                {q.tier === "verified" ? (
                  <span className="font-bold text-emerald-300">Verified</span>
                ) : (
                  <span className="font-bold text-amber-300">AI draft</span>
                )}
              </p>
              <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
              <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={`Options for question ${q.no}`}>
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
            {submitting ? "…" : `Submit ${answered}/${view.paper.length}`}
          </button>
          <p className="text-xs text-zinc-500">Unanswered count as wrong.</p>
        </div>
      ) : null}
      {view && !finished && mine?.done ? (
        <p className="text-center text-sm text-zinc-400" role="status">Submitted — waiting for the foe…</p>
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

"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";
import { levelForRating, sm2Next, START_RATING, updateRating } from "@/lib/game/adaptive";

type Stat = { rating: number; games: number };
type Q = { prompt_latex: string; hint: string; tolerance: number; check: unknown };
type Due = Q & { skill_tag: string; skill_name: string; level: number; reps: number; interval: number; due: number };
type NextQ = { skill_tag: string; skill_name: string; level: number; rating: number; question: Q };
type Mark = "idle" | "checking" | "right" | "wrong";

const STATS_KEY = "arena_adaptive_v1:stats";
const DUE_KEY = "arena_adaptive_v1:due";

export default function AdaptivePage() {
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [due, setDue] = useState<Due[]>([]);
  const [cur, setCur] = useState<(NextQ & { mode: "drill" | "review"; reviewKey: string | null }) | null>(null);
  const [answer, setAnswer] = useState("");
  const [mark, setMark] = useState<Mark>("idle");
  const [tried, setTried] = useState(false);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(STATS_KEY);
      const d = sessionStorage.getItem(DUE_KEY);
      const ps = s ? (JSON.parse(s) as Record<string, Stat>) : null;
      const pd = d ? (JSON.parse(d) as Due[]) : null;
      if (ps || pd) {
        queueMicrotask(() => {
          if (ps) setStats(ps);
          if (pd) setDue(pd);
        });
      }
    } catch {
      // Corrupt entries: start fresh.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STATS_KEY, JSON.stringify(stats));
      sessionStorage.setItem(DUE_KEY, JSON.stringify(due));
    } catch {
      // Quota/private mode: drill still works.
    }
  }, [stats, due]);

  async function fetchNext(s: Record<string, Stat>, d: Due[]) {
    setLoading(true);
    setError("");
    setAnswer("");
    setMark("idle");
    setTried(false);
    try {
      const now = Date.now();
      const ready = d.filter((x) => x.due <= now).sort((a, b) => a.due - b.due)[0];
      if (ready) {
        setCur({
          skill_tag: ready.skill_tag,
          skill_name: ready.skill_name,
          level: ready.level,
          rating: s[ready.skill_tag]?.rating ?? START_RATING,
          question: ready,
          mode: "review",
          reviewKey: `${ready.skill_tag}|${ready.prompt_latex}`,
        });
      } else {
        const r = await fetch("/api/adaptive/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stats: s }),
        });
        if (!r.ok) throw new Error(await readApiError(r, "Next failed."));
        const q = await readApiJson<NextQ>(r, "Next failed.");
        setCur({ ...q, mode: "drill", reviewKey: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Next failed.");
    } finally {
      setLoading(false);
    }
  }

  async function check() {
    if (!cur || mark === "checking" || answer.trim() === "" || !Number.isFinite(Number(answer))) return;
    setMark("checking");
    try {
      const r = await fetch("/api/paper/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: cur.question.check, tolerance: cur.question.tolerance, answer: Number(answer) }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Grade failed."));
      const d = await readApiJson<{ correct: boolean }>(r, "Grade failed.");
      // First attempt counts; retries only change the display mark.
      const firstTry = !tried;
      setTried(true);
      let ns = stats;
      let nd = due;
      if (firstTry) {
        const st = stats[cur.skill_tag] ?? { rating: START_RATING, games: 0 };
        ns = { ...stats, [cur.skill_tag]: { rating: updateRating(st.rating, cur.level, d.correct), games: st.games + 1 } };
        setStats(ns);
        setStreak((x) => (d.correct ? x + 1 : 0));
        if (cur.mode === "review" && cur.reviewKey) {
          const key = cur.reviewKey;
          const item = due.find((x) => `${x.skill_tag}|${x.prompt_latex}` === key);
          if (item) {
            const nx = sm2Next(item.reps, item.interval, d.correct ? 5 : 0);
            nd =
              nx.reps >= 3 && d.correct
                ? due.filter((x) => `${x.skill_tag}|${x.prompt_latex}` !== key)
                : due.map((x) =>
                    `${x.skill_tag}|${x.prompt_latex}` === key
                      ? { ...x, reps: nx.reps, interval: nx.intervalDays, due: Date.now() + nx.intervalDays * 86400000 }
                      : x,
                  );
            setDue(nd);
          }
        } else if (cur.mode === "drill" && !d.correct) {
          nd = [
            ...due.slice(-29),
            { ...cur.question, skill_tag: cur.skill_tag, skill_name: cur.skill_name, level: cur.level, reps: 0, interval: 1, due: Date.now() + 86400000 },
          ];
          setDue(nd);
        }
      }
      setMark(d.correct ? "right" : "wrong");
      if (d.correct) setTimeout(() => void fetchNext(ns, nd), 900);
    } catch {
      setMark("idle");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Adaptive drill"
        title={<>Your <span className="arena-title">level</span></>}
        sub="Weakest skill first, level matched to your rating. Misses come back on schedule."
        right={<span className="arena-num shrink-0 text-sm text-zinc-400">Streak <span className="font-bold text-amber-300">{streak}</span></span>}
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      {!cur && !loading ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Ready when you are.</p>
          <button type="button" onClick={() => void fetchNext(stats, due)} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white">
            Start drilling
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading question">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {cur && !loading ? (
        <div className={`arena-card rounded-2xl p-5 ${mark === "right" ? "border-emerald-700" : mark === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs text-zinc-500">
            {cur.mode === "review" ? <span className="font-bold text-amber-300">Review</span> : <span className="font-bold text-sky-300">Drill</span>}
            {" · "}{cur.skill_name} · <span className="font-bold text-amber-300">Lv {cur.level}</span>
            {" · "}rating <span className="arena-num font-bold text-zinc-200">{cur.rating}</span>
            {" → "}next Lv {levelForRating(cur.rating)}
          </p>
          <MathText text={cur.question.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          <p className="mt-1 text-sm text-zinc-400">Hint: {cur.question.hint}</p>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              step="any"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void check();
              }}
              placeholder="Your numeric answer"
              aria-label="Adaptive drill answer"
              disabled={mark === "right"}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void check()}
              disabled={mark === "checking" || mark === "right"}
              className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {mark === "checking" ? "…" : mark === "right" ? "✓" : mark === "wrong" ? "Retry" : "Check"}
            </button>
          </div>
          {mark === "wrong" ? (
            <button type="button" onClick={() => void fetchNext(stats, due)} className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-bold text-zinc-200">
              Skip — next question
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

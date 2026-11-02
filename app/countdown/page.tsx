"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

type Weak = { tag: string; name: string; misses: number; healed: boolean };
type Plan = { weak: Weak[]; totalWeak: number; healedWeak: number; readiness: number };

const DATE_KEY = "arena_exam_date_v1";
const DONE_KEY = "arena_countdown_done_v1";

function loadLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function dayISO(baseMs: number, offset: number): string {
  return new Date(baseMs + offset * 86400000).toISOString().slice(0, 10);
}

export default function CountdownPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [exam, setExam] = useState(() => loadLocal(DATE_KEY));
  const [done, setDone] = useState<string[]>(() => {
    try {
      return JSON.parse(loadLocal(DONE_KEY) || "[]") as string[];
    } catch {
      return [];
    }
  });
  // Current time is read after paint only — reading it during render breaks static prerender.
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      setNowMs(d.getTime());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/countdown")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        setPlan(d as Plan);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, []);

  function saveExam(v: string) {
    setExam(v);
    try {
      localStorage.setItem(DATE_KEY, v);
    } catch {
      // ignore
    }
  }

  function toggleDay(key: string) {
    setDone((prev) => {
      const next = prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key];
      try {
        localStorage.setItem(DONE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const examDate = exam ? new Date(exam + "T00:00:00Z") : null;
  const daysLeft =
    examDate && nowMs > 0 ? Math.round((examDate.getTime() - nowMs) / 86400000) : null;
  const unhealed = (plan?.weak ?? []).filter((w) => !w.healed);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Exam countdown"
        title="Ready before the bell rings"
        sub="One weak skill a day until exam day."
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="arena-card flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <label className="text-sm text-zinc-300">
          Exam date{" "}
          <input
            type="date"
            value={exam}
            onChange={(e) => saveExam(e.target.value)}
            aria-label="Exam date"
            className="arena-input ml-2 rounded-lg px-3 py-1.5 text-zinc-100"
          />
        </label>
        {daysLeft !== null ? (
          <p className="text-sm font-semibold text-amber-300">
            {daysLeft < 0 ? "That date passed — pick the next one." : `${daysLeft} days left`}
          </p>
        ) : null}
      </div>
      {!plan && !error ? <p className="text-zinc-500">Drawing your battle plan…</p> : null}
      {plan ? (
        <>
          <div className="arena-card rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-zinc-400">Readiness</p>
              <p className="font-display arena-num text-2xl font-black text-emerald-300">{plan.readiness}%</p>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${plan.readiness}%` }} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {plan.healedWeak}/{plan.totalWeak} weak skills healed
            </p>
          </div>
          {plan.totalWeak === 0 ? (
            <p className="text-zinc-500">No weak skills on record — scan some work first.</p>
          ) : daysLeft !== null && daysLeft >= 0 && unhealed.length > daysLeft ? (
            <p className="rounded-2xl border border-amber-500/50 bg-amber-950/40 p-3 text-sm text-amber-200">
              {unhealed.length} skills left but only {daysLeft} days — double up: 2 skills some days.
            </p>
          ) : null}
          {nowMs > 0 ? (
          <ol className="flex flex-col gap-2">
            {unhealed.map((w, i) => {
              const key = dayISO(nowMs, i);
              const checked = done.includes(key);
              return (
                <li key={w.tag} className="arena-card flex items-center gap-3 rounded-2xl p-3">
                  <button
                    type="button"
                    onClick={() => toggleDay(key)}
                    aria-label={checked ? `Uncheck ${w.name}` : `Check ${w.name} done`}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                      checked ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-zinc-600 text-zinc-500"
                    }`}
                  >
                    {checked ? "✓" : ""}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${checked ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                      Day {i + 1} · {w.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {key} · missed {w.misses}×
                    </p>
                  </div>
                  <Link href="/scan" className="arena-btn-ghost shrink-0 rounded-full px-4 py-1.5 text-xs text-zinc-200">
                    Practice
                  </Link>
                </li>
              );
            })}
          </ol>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

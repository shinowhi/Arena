"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

type Ghosts = {
  ghosts: number;
  hotSkills: Array<{ tag: string; name: string; count: number }>;
  solvedTonight: number;
  nightlyGoal: number;
};

const POLL_MS = 30000;

export default function GhostsPage() {
  const [data, setData] = useState<Ghosts | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/ghosts");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        if (alive) {
          setData(d as Ghosts);
          setError("");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Load failed.");
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const pct = data ? Math.min(100, Math.round((data.solvedTonight / data.nightlyGoal) * 100)) : 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Ghost classroom"
        title="You never grind alone"
        sub="Anonymous hunters grinding beside you tonight."
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {!data && !error ? <p className="text-zinc-500">Sensing nearby ghosts…</p> : null}
      {data ? (
        <>
          <div className="arena-card rounded-2xl p-6 text-center">
            <p className="font-display arena-num text-5xl font-black text-zinc-100">{data.ghosts}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {data.ghosts === 1 ? "ghost" : "ghosts"} grinding in the last 15 minutes
            </p>
          </div>
          <div className="arena-card rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-zinc-400">Tonight, together</p>
              <p className="text-sm font-bold text-zinc-200">
                {data.solvedTonight}/{data.nightlyGoal}
              </p>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="arena-card rounded-2xl p-4">
            <p className="mb-2 text-sm font-semibold text-zinc-300">Glowing right now</p>
            {data.hotSkills.length === 0 ? (
              <p className="text-sm text-zinc-500">Quiet… be the first ghost tonight.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.hotSkills.map((s) => (
                  <span
                    key={s.tag}
                    title={`${s.count} solves in 15 min`}
                    className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-300"
                  >
                    {s.name} · {s.count}
                  </span>
                ))}
              </div>
            )}
          </div>
          <nav className="flex flex-wrap gap-3 text-sm" aria-label="Keep grinding">
            <Link href="/arena" className="arena-btn-primary rounded-full px-5 py-2 font-semibold text-white">
              Join the grind
            </Link>
            <Link href="/scan" className="arena-btn-ghost rounded-full px-5 py-2 font-medium text-zinc-200">
              Scan your work
            </Link>
          </nav>
        </>
      ) : null}
    </main>
  );
}

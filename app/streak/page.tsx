"use client";
import { useEffect, useState } from "react";

type StreakData = {
  streak: number;
  totalActive: number;
  heatmap: Array<{ date: string; count: number }>;
};

function cellColor(count: number): string {
  if (count <= 0) return "bg-zinc-800";
  if (count <= 2) return "bg-emerald-900";
  if (count <= 5) return "bg-emerald-700";
  return "bg-emerald-400";
}

export default function StreakPage() {
  const [data, setData] = useState<StreakData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/streak")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        setData(d as StreakData);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <div>
        <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Healing streak</p>
        <h1 className="text-2xl font-bold text-zinc-100">Patch a little every day</h1>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {!data && !error ? <p className="text-zinc-500">Loading your streak…</p> : null}
      {data ? (
        <>
          <div className="arena-card rounded-2xl p-6 text-center">
            <p className="text-5xl font-black text-emerald-300">{data.streak}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {data.streak === 1 ? "day in a row" : "days in a row"} · {data.totalActive} active days total
            </p>
          </div>
          <div className="arena-card overflow-x-auto rounded-2xl p-4">
            <div className="grid min-w-max grid-flow-col grid-rows-7 gap-1">
              {data.heatmap.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count} actions`}
                  className={`h-3 w-3 rounded-sm ${cellColor(d.count)}`}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <span>Less</span>
              <span className="h-3 w-3 rounded-sm bg-zinc-800" />
              <span className="h-3 w-3 rounded-sm bg-emerald-900" />
              <span className="h-3 w-3 rounded-sm bg-emerald-700" />
              <span className="h-3 w-3 rounded-sm bg-emerald-400" />
              <span>More</span>
            </div>
          </div>
          <nav className="flex gap-4 text-sm">
            <a href="/diary" className="underline text-zinc-300">
              Root diary
            </a>
            <a href="/scan" className="underline text-zinc-300">
              Scan to keep the streak
            </a>
            <a href="/arena" className="underline text-zinc-300">
              Back to arena
            </a>
          </nav>
        </>
      ) : null}
    </main>
  );
}

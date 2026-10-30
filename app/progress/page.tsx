"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import graph from "@/lib/graph/skill-graph.json";

type Week = { week: string; skills: Record<string, "red" | "green"> };
type Timeline = { ready: boolean; timeline?: Week[] };

const SKILLS = graph.skills as { id: string; name: string }[];
const DOT: Record<string, string> = {
  red: "bg-red-500",
  green: "bg-emerald-400",
  gray: "bg-zinc-700",
};

export default function ProgressPage() {
  const [data, setData] = useState<Timeline | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const idxRef = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stop = false;
    fetch("/api/progress/timeline")
      .then((r) => r.json())
      .then((d) => {
        if (!stop) setData(d as Timeline);
      })
      .catch(() => {
        if (!stop) setFailed(true);
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!playing || !data?.timeline?.length) return;
    const len = data.timeline.length;
    timer.current = setInterval(() => {
      const n = Math.min(idxRef.current + 1, len - 1);
      idxRef.current = n;
      setIdx(n);
      if (n >= len - 1) {
        if (timer.current) clearInterval(timer.current);
        setPlaying(false);
      }
    }, 800);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, data]);

  if (failed)
    return (
      <main className="mx-auto max-w-3xl p-6 text-center">
        <h1 className="text-2xl font-bold">Your healing story</h1>
        <p className="mt-4 text-zinc-400">Could not load progress. Try again later.</p>
      </main>
    );
  if (!data)
    return (
      <main className="mx-auto max-w-3xl p-6 text-center">
        <h1 className="text-2xl font-bold">Your healing story</h1>
        <p className="mt-4 animate-pulse text-zinc-400">Loading your time-lapse…</p>
      </main>
    );
  if (!data.ready || !data.timeline?.length)
    return (
      <main className="mx-auto max-w-3xl p-6 text-center">
        <h1 className="text-2xl font-bold">Your healing story</h1>
        <p className="mt-4 text-zinc-400">Keep scanning — your story starts here.</p>
        <Link href="/scan" className="mt-6 inline-block rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-black">
          Scan your first exam
        </Link>
      </main>
    );

  const weeks = data.timeline;
  const cur = weeks[Math.min(idx, weeks.length - 1)];
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-center text-2xl font-bold">Your healing story</h1>
      <p className="mt-1 text-center text-sm text-zinc-400">
        Week of {cur.week} · {idx + 1} of {weeks.length}
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => {
            if (playing) {
              setPlaying(false);
            } else {
              idxRef.current = 0;
              setIdx(0);
              setPlaying(true);
            }
          }}
          className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={weeks.length - 1}
          value={idx}
          aria-label="Week"
          onChange={(e) => {
            setPlaying(false);
            idxRef.current = Number(e.target.value);
            setIdx(idxRef.current);
          }}
          className="w-full accent-emerald-400"
        />
      </div>
      <div className="mt-6 grid grid-cols-6 gap-2 sm:grid-cols-9">
        {SKILLS.map((s) => {
          const st = cur.skills[s.id] ?? "gray";
          return (
            <div key={s.id} title={s.name} className={`aspect-square rounded-lg ${DOT[st]}`} />
          );
        })}
      </div>
      <div className="mt-4 flex justify-center gap-6 text-sm text-zinc-400">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-red-500" />Weak</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-emerald-400" />Healed</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-zinc-700" />Unknown</span>
      </div>
      <div className="mt-6 text-center">
        <Link href="/graph" className="text-sm text-emerald-400 underline">Open full skill tree</Link>
      </div>
    </main>
  );
}
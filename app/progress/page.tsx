"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import graph from "@/lib/graph/skill-graph.json";
import EmptyState from "@/components/ui/EmptyState";

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
        <p className="arena-kicker">Progress</p>
        <h1 className="font-display mt-1 text-2xl font-extrabold">Your healing story</h1>
        <p className="mt-4 text-zinc-400">Could not load progress. Try again later.</p>
      </main>
    );
  if (!data)
    return (
      <main className="mx-auto max-w-3xl p-6 text-center">
        <p className="arena-kicker">Progress</p>
        <h1 className="font-display mt-1 text-2xl font-extrabold">Your healing story</h1>
        <div className="mx-auto mt-6 grid max-w-md grid-cols-9 gap-2" aria-label="Loading your time-lapse">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="arena-shimmer aspect-square rounded-lg" />
          ))}
        </div>
      </main>
    );
  if (!data.ready || !data.timeline?.length)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="text-center">
          <p className="arena-kicker">Progress</p>
          <h1 className="font-display mt-1 text-2xl font-extrabold">Your healing story</h1>
        </div>
        <div className="mt-6">
          <EmptyState
            title="Your story starts here."
            body="Keep scanning — every scan adds a week to your time-lapse."
            actionLabel="Scan your first exam"
            actionHref="/scan"
          />
        </div>
      </main>
    );

  const weeks = data.timeline;
  const cur = weeks[Math.min(idx, weeks.length - 1)];
  return (
    <main className="mx-auto max-w-3xl p-6">
      <p className="arena-kicker text-center">Progress</p>
      <h1 className="font-display mt-1 text-center text-2xl font-extrabold">Your healing story</h1>
      <p className="arena-num mt-1 text-center text-sm text-zinc-400">
        Week of {cur.week} · {idx + 1} of {weeks.length}
      </p>
      <div className="arena-card mt-4 flex items-center gap-3 rounded-2xl p-3">
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
          aria-label={playing ? "Pause replay" : "Replay healing story"}
          className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white"
        >
          {playing ? "❚❚ Pause" : "▶ Replay"}
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
            <div key={s.id} title={s.name} className={`aspect-square rounded-lg transition-transform hover:scale-110 ${DOT[st]}`} />
          );
        })}
      </div>
      <div className="mt-4 flex justify-center gap-6 text-sm text-zinc-400">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-red-500" />Weak</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-emerald-400" />Healed</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-zinc-700" />Unknown</span>
      </div>
      <div className="mt-6 text-center">
        <Link href="/graph" className="arena-btn-ghost inline-block rounded-full px-5 py-2 text-sm font-medium text-zinc-200">Open full skill tree</Link>
      </div>
    </main>
  );
}
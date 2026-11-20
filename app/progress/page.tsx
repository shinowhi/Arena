"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import graph from "@/lib/graph/skill-graph.json";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStat } from "@/components/ui/Hero";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";

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
    // Reduced motion: skip the animated replay and show the final week at once.
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const last = len - 1;
        idxRef.current = last;
        // Microtask keeps the no-sync-setState lint rule happy.
        queueMicrotask(() => {
          setIdx(last);
          setPlaying(false);
        });
        return;
      }
    } catch {
      // matchMedia unavailable: fall through to the animated replay.
    }
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
      <main className="mx-auto max-w-2xl p-6 text-center">
        <p className="arena-kicker">Tiến độ</p>
        <h1 className="font-display mt-1 text-2xl font-extrabold">Hành trình hồi phục</h1>
        <p role="alert" className="mt-4 text-zinc-400">Không tải được tiến độ. Kiểm tra mạng rồi thử lại nhé.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="arena-btn-ghost mt-4 rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
        >
          Thử lại
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="mx-auto max-w-2xl p-6 text-center">
        <p className="arena-kicker">Tiến độ</p>
        <h1 className="font-display mt-1 text-2xl font-extrabold">Hành trình hồi phục</h1>
        <div className="mx-auto mt-6 grid max-w-md grid-cols-9 gap-2" aria-label="Đang tải hành trình của bạn">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="arena-shimmer aspect-square rounded-lg" />
          ))}
        </div>
      </main>
    );
  if (!data.ready || !data.timeline?.length)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <PageHeader
          kicker="Tiến độ"
          title="Hành trình hồi phục"
          sub="Mỗi lần quét thêm một tuần vào hành trình của bạn."
        />
        <div className="mt-6">
          <EmptyState
            title="Hành trình bắt đầu từ đây."
            body="Chăm quét bài nhé — mỗi lần quét thêm một tuần vào hành trình."
            actionLabel="Quét bài đầu tiên"
            actionHref="/scan"
          />
        </div>
      </main>
    );

  const weeks = data.timeline;
  const cur = weeks[Math.min(idx, weeks.length - 1)];
  const healed = Object.values(cur.skills).filter((s) => s === "green").length;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      <HeroStat
        value={`${healed}/${SKILLS.length}`}
        label={`kỹ năng đã chữa — tuần ${cur.week}`}
        hint={`Tuần ${idx + 1} trên ${weeks.length} — kéo thanh trượt để xem lại`}
      />
      <PageHeader
        kicker="Tiến độ"
        title="Hành trình hồi phục"
        sub="Mỗi lần quét thêm một tuần vào hành trình của bạn."
      />
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
          aria-label={playing ? "Tạm dừng" : "Xem lại hành trình hồi phục"}
          className="arena-btn-primary inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white"
        >
          {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          {playing ? "Tạm dừng" : "Xem lại"}
        </button>
        <input
          type="range"
          min={0}
          max={weeks.length - 1}
          value={idx}
          aria-label="Tuần"
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
            <div key={s.id} title={s.name} className={`aspect-square rounded-lg transition-transform motion-safe:hover:scale-110 motion-reduce:transition-none ${DOT[st]}`} />
          );
        })}
      </div>
      <div className="mt-4 flex justify-center gap-6 text-sm text-zinc-400">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-red-500" />Yếu</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-emerald-400" />Đã chữa</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-zinc-700" />Chưa rõ</span>
      </div>
      <div className="mt-6 text-center">
        <Link href="/graph" className="arena-btn-ghost inline-block rounded-full px-5 py-2 text-sm font-medium text-zinc-200">Mở cây kỹ năng</Link>
      </div>
    </main>
  );
}
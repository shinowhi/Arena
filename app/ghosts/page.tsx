"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import HotSkills, { type HotSkill } from "@/components/ghosts/HotSkills";
import GhostFeed, { type FeedItem } from "@/components/ghosts/GhostFeed";

type GhostsData = {
  ghosts: number;
  hotSkills: HotSkill[];
  solvedTonight: number;
  nightlyGoal: number;
  recent: FeedItem[];
  youTonight: boolean;
};

const POLL_MS = 30000;

export default function GhostsPage() {
  const [data, setData] = useState<GhostsData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/ghosts");
        const d = await r.json();
        if (!r.ok) throw new Error("load-failed");
        if (alive) {
          setData({
            ghosts: typeof d.ghosts === "number" ? d.ghosts : 0,
            hotSkills: Array.isArray(d.hotSkills) ? d.hotSkills : [],
            solvedTonight: typeof d.solvedTonight === "number" ? d.solvedTonight : 0,
            nightlyGoal: typeof d.nightlyGoal === "number" && d.nightlyGoal > 0 ? d.nightlyGoal : 100,
            recent: Array.isArray(d.recent) ? d.recent : [],
            youTonight: d.youTonight === true,
          });
          setError("");
        }
      } catch {
        if (alive) setError("Không tìm thấy ma. Kiểm tra mạng rồi thử lại nhé.");
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [attempt]);

  const pct = data ? Math.min(100, Math.round((data.solvedTonight / data.nightlyGoal) * 100)) : 0;
  const total = data ? data.ghosts + (data.youTonight ? 1 : 0) : 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Lớp học ma"
        title="Tối nay không cày một mình"
        sub="Những thợ săn ẩn danh đang cày cùng bạn. Không tên, không mặt — chỉ có tiến độ."
      />
      {error ? (
        <div role="alert" className="arena-card flex min-h-[48px] flex-wrap items-center gap-3 rounded-2xl p-4">
          <p className="min-w-0 flex-1 basis-48 text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setAttempt((a) => a + 1);
            }}
            className="arena-btn-ghost inline-flex min-h-[48px] shrink-0 items-center rounded-full px-5 py-2 text-sm font-semibold text-zinc-200"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {!data && !error ? (
        <>
          <p className="sr-only" role="status">
            Đang tìm ma…
          </p>
          <div aria-hidden="true" className="flex flex-col gap-5">
            <div className="arena-card rounded-2xl p-6">
              <div className="arena-shimmer mx-auto h-12 w-24 rounded-xl" />
              <div className="arena-shimmer mx-auto mt-2 h-4 w-48 rounded-full" />
            </div>
            <div className="arena-card rounded-2xl p-4">
              <div className="arena-shimmer h-3 rounded-full" />
            </div>
            <div className="arena-card rounded-2xl p-4">
              <div className="arena-shimmer h-10 rounded-xl" />
            </div>
          </div>
        </>
      ) : null}
      {data ? (
        <>
          <div className="arena-card rounded-2xl p-6 text-center">
            <p className="font-display arena-num text-5xl font-black text-zinc-100">{total}</p>
            <p className="mt-1 text-sm text-zinc-400">
              {data.youTonight ? (
                <>Bạn đang là 1 trong {total} ghost</>
              ) : (
                <>
                  {data.ghosts} ghost đang cày trong 15 phút qua
                </>
              )}
            </p>
          </div>
          <div className="arena-card rounded-2xl p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-zinc-400">Tối nay, cùng nhau</p>
              <p className="shrink-0 text-sm font-bold text-zinc-200 tabular-nums">
                {data.solvedTonight}/{data.nightlyGoal}
              </p>
            </div>
            <div
              className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-800"
              role="progressbar"
              aria-label="Tiến độ giải bài tối nay"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-sky-500 transition-all motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <HotSkills skills={data.hotSkills} />
          <GhostFeed items={data.recent} />
          <nav className="flex flex-wrap gap-3 text-sm" aria-label="Cày tiếp">
            <Link href="/arena" className="arena-btn-primary inline-flex min-h-[48px] items-center rounded-full px-5 py-2 font-semibold text-white">
              Vào đấu trường
            </Link>
            <Link href="/scan" className="arena-btn-ghost inline-flex min-h-[48px] items-center rounded-full px-5 py-2 font-medium text-zinc-200">
              Quét bài của bạn
            </Link>
          </nav>
        </>
      ) : null}
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStat } from "@/components/ui/Hero";

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
      <HeroStat
        value={data ? data.streak : "…"}
        label="ngày liên tiếp"
        hint={data ? `Tổng ${data.totalActive} ngày hoạt động — đều đặn thắng nhồi nhét` : error ? "Không tải được chuỗi." : "Đang tải chuỗi của bạn…"}
      />
      <PageHeader
        kicker="Chuỗi hồi phục"
        title="Mỗi ngày vá một ít"
        sub="Ngày hoạt động nào cũng tính."
      />
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      {data ? (
        <>
          <div className="arena-card overflow-x-auto rounded-2xl p-4">
            <div className="grid min-w-max grid-flow-col grid-rows-7 gap-1" role="img" aria-label={`Chuỗi ${data.streak} ngày, tổng ${data.totalActive} ngày hoạt động`}>
              {data.heatmap.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count} hoạt động`}
                  className={`h-3 w-3 rounded-sm ${cellColor(d.count)}`}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
              <span>Ít</span>
              <span className="h-3 w-3 rounded-sm bg-zinc-800" />
              <span className="h-3 w-3 rounded-sm bg-emerald-900" />
              <span className="h-3 w-3 rounded-sm bg-emerald-700" />
              <span className="h-3 w-3 rounded-sm bg-emerald-400" />
              <span>Nhiều</span>
            </div>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/diary" className="underline text-zinc-300 hover:text-white">
              Nhật ký gốc
            </Link>
            <Link href="/scan" className="underline text-zinc-300 hover:text-white">
              Quét để giữ chuỗi
            </Link>
            <Link href="/arena" className="underline text-zinc-300 hover:text-white">
              Về đấu trường
            </Link>
          </nav>
        </>
      ) : null}
    </main>
  );
}

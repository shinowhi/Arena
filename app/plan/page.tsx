"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { HeroList } from "@/components/ui/Hero";
import { skillName } from "@/lib/graph/skills";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Day = { day: number; focus_skill: string; tasks: string[]; minutes: number };

export default function PlanPage() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError("");
      setDays(null);
    });
    fetch("/api/plan")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được kế hoạch."));
        return readApiJson<{ days: Day[] }>(r, "Không tải được kế hoạch.");
      })
      .then((d) => {
        if (alive) setDays(d.days);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được kế hoạch.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroList
        count={days ? `${days.reduce((a, d) => a + d.minutes, 0)}’` : "…"}
        label={days ? `phút trong 7 ngày — ngày 7 tổng tấn công boss` : "Đang dựng kế hoạch…"}
      />
      <PageHeader
        kicker="Tuần của bạn"
        title={<>Kế hoạch <span className="arena-title">7 ngày</span></>}
        sub="Dựng từ lịch sử quét bài thật của bạn."
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang dựng kế hoạch">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Đang đọc lỗ hổng, viết kế hoạch tuần…</p>
        </div>
      ) : null}
      {error ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">{error}</p>
          <Link href="/scan" className="arena-btn-primary rounded-full px-5 py-2 text-sm font-bold text-white">
            Quét bài làm
          </Link>
        </div>
      ) : null}
      {days?.map((d) => (
        <div key={d.day} className="arena-card rounded-2xl p-5">
          <p className="text-xs font-bold text-zinc-500 tabular-nums">
            Ngày {d.day} — <span className="font-bold text-amber-300">{d.minutes} phút</span>
          </p>
          <h2 className="font-display mt-1 text-xl font-extrabold text-zinc-50">{skillName(d.focus_skill)}</h2>
          <ul className="mt-2 flex list-none flex-col gap-1.5">
            {d.tasks.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="arena-num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-emerald-300 tabular-nums">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}

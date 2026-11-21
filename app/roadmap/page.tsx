"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStat } from "@/components/ui/Hero";
import { CheckIcon, GiftIcon } from "@/components/ui/icons";

interface WeakEntry {
  tag: string;
  name: string;
  misses: number;
  healed: boolean;
}

const DAYS = 30;
const CHECK_PREFIX = "roadmap-check-";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function loadChecks(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECK_PREFIX + "all");
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export default function RoadmapPage() {
  const router = useRouter();
  const [weak, setWeak] = useState<WeakEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<Set<string>>(new Set());
  const [summoning, setSummoning] = useState("");
  // Current time is read after paint only — reading it during render breaks static prerender.
  const [todayMs, setTodayMs] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setTodayMs(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/countdown");
        const data = (await res.json().catch(() => null)) as { weak?: WeakEntry[]; error?: string } | null;
        if (!alive) return;
        if (!res.ok || !data || !Array.isArray(data.weak)) {
          throw new Error(data?.error ?? "Không tải được lộ trình.");
        }
        setWeak(data.weak);
        setChecks(loadChecks());
        setLoaded(true);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Không tải được lộ trình.");
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  function toggleCheck(key: string) {
    setChecks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(CHECK_PREFIX + "all", JSON.stringify([...next]));
      } catch {
        /* private mode: checks just don't persist */
      }
      return next;
    });
  }

  async function summon(tag: string) {
    if (summoning) return;
    setSummoning(tag);
    setError("");
    try {
      const res = await fetch("/api/boss/summon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_tag: tag }),
      });
      const data = (await res.json().catch(() => null)) as { boss_id?: string; error?: string } | null;
      if (!res.ok || !data?.boss_id) throw new Error(data?.error ?? "Gọi boss thất bại.");
      router.push(`/boss/${data.boss_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gọi boss thất bại.");
      setSummoning("");
    }
  }

  const todayKey = todayMs > 0 ? dateKey(new Date(todayMs)) : "";
  const open = weak.filter((w) => !w.healed);
  const focusList = open.length > 0 ? open : weak; // review mode when everything is healed
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(todayMs + i * 86400000);
    const focus = focusList.length > 0 ? focusList[i % focusList.length]! : null;
    return { date: d, key: dateKey(d), focus };
  });
  const checkedCount = days.filter((d) => checks.has(d.key)).length;
  const todayDone = checks.has(todayKey);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-col gap-5">
      <HeroStat
        value={loaded ? `${checkedCount}/${DAYS}` : "…"}
        label="ngày đã đánh dấu"
        hint={loaded ? (open.length > 0 ? `${open.length} điểm yếu còn lại — kỹ năng yếu nhất trước` : "Mọi điểm yếu đã chữa — chế độ ôn lại") : "Đang dựng lộ trình…"}
      />
      <PageHeader
        kicker="Kế hoạch 30 ngày"
        title="Lộ trình"
        sub="Mỗi ngày đánh một mục tiêu, đánh dấu xong, rồi xem danh sách ngắn lại."
      />
      </div>

      {loaded && focusList.length === 0 && !error && (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
          <p className="text-zinc-200">Chưa có kỹ năng yếu nào — lộ trình cần dữ liệu trước.</p>
          <Link
            href="/scan"
            className="arena-btn-primary mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-bold text-white"
          >
            Quét bài tập để bắt đầu
          </Link>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

      {loaded && todayMs > 0 && focusList.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${todayDone ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-300"}`}>
              {todayDone ? <><CheckIcon className="h-4 w-4" /> Hôm nay đã đánh dấu — chuỗi an toàn</> : "Hôm nay chưa đánh dấu"}
            </span>
            <span className="text-zinc-400 tabular-nums">
              {checkedCount}/{DAYS} ngày đã đánh dấu — {open.length} điểm yếu
              {open.length === 0 && " — chế độ ôn lại"}
            </span>
            {open.length === 0 && <GiftIcon className="h-4 w-4 text-amber-300" />}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {days.map((d, i) => {
              const done = checks.has(d.key);
              const isToday = d.key === todayKey;
              return (
                <article
                  key={d.key}
                  className={`rounded-xl border p-3 ${isToday ? "border-amber-600 bg-amber-950/20" : "border-zinc-800 bg-zinc-900/40"} ${done ? "opacity-80" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-zinc-400">
                      {i === 0 ? "Hôm nay" : d.date.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" })}
                    </p>
                    <button
                      onClick={() => toggleCheck(d.key)}
                      title={done ? "Bỏ đánh dấu" : "Đánh dấu"}
                      aria-label={done ? "Bỏ đánh dấu ngày" : "Đánh dấu ngày"}
                      aria-pressed={done}
                      className={`relative flex h-6 w-6 items-center justify-center rounded-full border text-sm after:absolute after:-inset-3 after:content-[''] ${done ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-zinc-700 text-zinc-600 hover:border-zinc-500"}`}
                    >
                      {done ? <CheckIcon className="h-3.5 w-3.5" /> : ""}
                    </button>
                  </div>
                  {d.focus && (
                    <>
                      <p className="mt-2 min-h-8 text-sm font-semibold text-zinc-100">
                        {d.focus.name}
                      </p>
                      <p className="text-xs tabular-nums text-zinc-500">
                        {d.focus.healed ? "ôn lại" : `${d.focus.misses} câu sai`}
                      </p>
                      <button
                        onClick={() => void summon(d.focus!.tag)}
                        disabled={summoning !== ""}
                        className="arena-btn-primary mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {summoning === d.focus.tag ? "Đang gọi…" : "Đánh"}
                      </button>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

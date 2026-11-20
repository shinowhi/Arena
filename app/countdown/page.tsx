"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { CheckIcon } from "@/components/ui/icons";

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
        if (!r.ok) throw new Error(d.error ?? "Không tải được kế hoạch.");
        setPlan(d as Plan);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được kế hoạch."));
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
        kicker="Đếm ngược ngày thi"
        title="Sẵn sàng trước giờ G"
        sub="Mỗi ngày chữa một kỹ năng yếu cho đến ngày thi."
      />
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      <div className="arena-card flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <label className="text-sm text-zinc-300">
          Ngày thi{" "}
          <input
            type="date"
            value={exam}
            onChange={(e) => saveExam(e.target.value)}
            aria-label="Ngày thi"
            className="arena-input ml-2 rounded-lg px-3 py-1.5 text-zinc-100"
          />
        </label>
        {daysLeft !== null ? (
          <p className="text-sm font-semibold text-amber-300 tabular-nums">
            {daysLeft < 0 ? "Ngày đó đã qua — chọn ngày tiếp theo." : `Còn ${daysLeft} ngày`}
          </p>
        ) : null}
      </div>
      {!plan && !error ? <p role="status" className="text-zinc-500">Đang vẽ kế hoạch ôn tập…</p> : null}
      {plan ? (
        <>
          <div className="arena-card rounded-2xl p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-zinc-400">Mức sẵn sàng</p>
              <p className="font-display arena-num text-2xl font-black text-emerald-300 tabular-nums">{plan.readiness}%</p>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${plan.readiness}%` }} />
            </div>
            <p className="mt-1 text-xs text-zinc-500 tabular-nums">
              Đã chữa {plan.healedWeak}/{plan.totalWeak} kỹ năng yếu
            </p>
          </div>
          {plan.totalWeak === 0 ? (
            <p className="text-zinc-500">Chưa ghi nhận kỹ năng yếu nào — quét bài làm trước nhé.</p>
          ) : daysLeft !== null && daysLeft >= 0 && unhealed.length > daysLeft ? (
            <p className="rounded-2xl border border-amber-500/50 bg-amber-950/40 p-3 text-sm text-amber-200 tabular-nums">
              Còn {unhealed.length} kỹ năng mà chỉ còn {daysLeft} ngày — tăng tốc: vài ngày làm 2 kỹ năng.
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
                    aria-label={checked ? `Bỏ đánh dấu ${w.name}` : `Đánh dấu đã xong ${w.name}`}
                    className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors after:absolute after:-inset-3 after:content-[''] ${
                      checked ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-300"
                    }`}
                  >
                    {checked ? <CheckIcon className="h-3.5 w-3.5" label="Đã xong" /> : ""}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${checked ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                      Ngày {i + 1} — {w.name}
                    </p>
                    <p className="text-xs text-zinc-500 tabular-nums">
                      {key} — sai {w.misses} lần
                    </p>
                  </div>
                  <Link href="/scan" className="arena-btn-ghost shrink-0 rounded-full px-4 py-1.5 text-xs text-zinc-200 transition-colors hover:text-white">
                    Luyện tập
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

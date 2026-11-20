"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Target = { skill_tag: string; skill_name: string; wrong_count: number };

export default function RevengePage() {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [summoning, setSummoning] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setError("");
      setTarget(undefined);
    });
    fetch("/api/boss/revenge")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Không tìm được mục tiêu phục thù."));
        return readApiJson<{ target: Target | null }>(r, "Không tìm được mục tiêu phục thù.");
      })
      .then((d) => {
        if (alive) setTarget(d.target);
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof Error ? e.message : "Không tìm được mục tiêu phục thù.");
          setTarget(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [retry]);

  // Sync ref guard: disabled={summoning} applies only after re-render, so a
  // same-tick double-click would forge two bosses without this.
  const summonRef = useRef(false);

  async function summon() {
    if (summonRef.current) return;
    summonRef.current = true;
    setSummoning(true);
    setError("");
    try {
      const r = await fetch("/api/boss/revenge", { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Triệu hồi boss phục thù thất bại."));
      const d = await readApiJson<{ boss_id: string }>(r, "Triệu hồi boss phục thù thất bại.");
      router.push(`/boss/${d.boss_id}?revenge=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triệu hồi boss phục thù thất bại.");
      setSummoning(false);
      summonRef.current = false;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Tái đấu"
        title={<>Boss <span className="arena-title">phục thù</span></>}
        sub="Rèn từ chính những câu bạn làm sai: kỹ năng bạn sai nhiều nhất, 5 câu mới tránh các câu gần đây của bạn."
      />
      {target === undefined && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tìm câu bạn làm sai">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Đang đếm câu sai của bạn…</p>
        </div>
      ) : null}
      {error && !target ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">
            {error}
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setRetry((r) => r + 1)}
              className="arena-btn-primary rounded-full px-5 py-2 text-sm font-bold text-white"
            >
              Tìm lại
            </button>
            <Link href="/arena" className="arena-btn-ghost inline-block rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white">
              Về đấu trường
            </Link>
          </div>
        </div>
      ) : null}
      {target ? (
        <div className="arena-enter arena-card relative overflow-hidden rounded-2xl p-6 text-center">
          <p className="text-xs font-bold text-red-400">Kỹ năng bạn sai nhiều nhất</p>
          <h2 className="font-display mt-1 text-2xl font-black text-zinc-50">{target.skill_name}</h2>
          <p className="arena-num mt-1 text-sm text-zinc-400 tabular-nums">
            <span className="font-bold text-red-300">{target.wrong_count}</span>{" "}
            lần sai đã ghi nhận
          </p>
          <button
            type="button"
            onClick={summon}
            disabled={summoning}
            className="arena-btn-primary mt-4 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
          >
            {summoning ? "Đang rèn trận tái đấu…" : "Triệu hồi boss phục thù"}
          </button>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">Bộ câu mới đã kiểm chứng — tránh các câu gần đây của bạn.</p>
        </div>
      ) : null}
      {target ? (
        <Link href="/misses" className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white">
          Hoặc luyện đúng những câu bạn đã sai
        </Link>
      ) : null}
      {target === null && !error ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-zinc-100">Thành tích sạch.</h2>
          <p className="text-sm text-zinc-400">Chưa sai câu nào — đánh boss trước, rồi quay lại phục thù.</p>
          <Link href="/arena" className="arena-btn-primary rounded-full px-5 py-2 text-sm font-bold text-white">
            Tìm boss
          </Link>
        </div>
      ) : null}
    </main>
  );
}

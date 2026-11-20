"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroAction } from "@/components/ui/Hero";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

export default function GauntletPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<{ skills: string[]; names: string[] } | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [summoning, setSummoning] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setError("");
      setSkills(undefined);
    });
    fetch("/api/boss/gauntlet")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Không tìm được thử thách gauntlet."));
        return readApiJson<{ skills: string[]; names: string[] }>(r, "Không tìm được thử thách gauntlet.");
      })
      .then((d) => {
        if (alive) setSkills(d);
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof Error ? e.message : "Không tìm được thử thách gauntlet.");
          setSkills(null);
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
      const r = await fetch("/api/boss/gauntlet", { method: "POST" });
      if (!r.ok) throw new Error(await readApiError(r, "Triệu hồi boss gauntlet thất bại."));
      const d = await readApiJson<{ boss_id: string }>(r, "Triệu hồi boss gauntlet thất bại.");
      router.push(`/boss/${d.boss_id}?gauntlet=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triệu hồi boss gauntlet thất bại.");
      setSummoning(false);
      summonRef.current = false;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroAction
        title="Một boss, năm kỹ năng"
        sub={skills ? "Mỗi cấp kiểm tra một lỗ hổng khác nhau — triệu hồi ngay lập tức." : "Đang chọn năm kỹ năng của bạn…"}
      >
        <button
          type="button"
          onClick={summon}
          disabled={summoning || !skills}
          className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
        >
          {summoning ? "Đang rèn gauntlet…" : "Triệu hồi boss gauntlet"}
        </button>
      </HeroAction>
      <PageHeader
        kicker="Ôn tổng hợp"
        title={<>Boss <span className="arena-title">gauntlet</span></>}
        sub="Cấp i kiểm tra lỗ hổng yếu thứ i của bạn."
      />
      {skills === undefined && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang chọn năm kỹ năng">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Đang chọn năm kỹ năng của bạn…</p>
        </div>
      ) : null}
      {error && !skills ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className="arena-btn-primary mt-3 rounded-full px-5 py-2 text-sm font-bold text-white"
          >
            Tìm lại
          </button>
        </div>
      ) : null}
      {skills ? (
        <div className="arena-enter arena-card relative overflow-hidden rounded-2xl p-6 text-center">
          <p className="text-xs font-bold text-amber-300">Năm kỹ năng tối nay</p>
          <ol className="mx-auto mt-2 flex w-fit flex-col gap-1 text-left">
            {skills.names.map((n, i) => (
              <li key={skills.skills[i]} className="flex items-center gap-2 text-sm text-zinc-200">
                <span className="arena-num flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-amber-300 tabular-nums">
                  {i + 1}
                </span>
                {n}
              </li>
            ))}
          </ol>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      <Link href="/arena" className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white">
        Về đấu trường
      </Link>
    </main>
  );
}

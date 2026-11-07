"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
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
        if (!r.ok) throw new Error(await readApiError(r, "Gauntlet lookup failed."));
        return readApiJson<{ skills: string[]; names: string[] }>(r, "Gauntlet lookup failed.");
      })
      .then((d) => {
        if (alive) setSkills(d);
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof Error ? e.message : "Gauntlet lookup failed.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Gauntlet summon failed."));
      const d = await readApiJson<{ boss_id: string }>(r, "Gauntlet summon failed.");
      router.push(`/boss/${d.boss_id}?gauntlet=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gauntlet summon failed.");
      setSummoning(false);
      summonRef.current = false;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Mixed review"
        title={<>Gauntlet <span className="arena-title">boss</span></>}
        sub="One boss, five skills — level i tests your i-th weakest gap. Built from cached sets, so it summons instantly."
      />
      {skills === undefined && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Picking your five skills">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Picking your five skills…</p>
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
            Retry lookup
          </button>
        </div>
      ) : null}
      {skills ? (
        <div className="arena-enter arena-card relative overflow-hidden rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-amber-300 uppercase">Tonight&apos;s five</p>
          <ol className="mx-auto mt-2 flex w-fit flex-col gap-1 text-left">
            {skills.names.map((n, i) => (
              <li key={skills.skills[i]} className="flex items-center gap-2 text-sm text-zinc-200">
                <span className="arena-num flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-amber-300">
                  {i + 1}
                </span>
                {n}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={summon}
            disabled={summoning}
            className="arena-btn-primary mt-4 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
          >
            {summoning ? "Forging gauntlet…" : "Summon gauntlet boss"}
          </button>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      <Link href="/arena" className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
        Back to arena
      </Link>
    </main>
  );
}

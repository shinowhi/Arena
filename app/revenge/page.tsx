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
        if (!r.ok) throw new Error(await readApiError(r, "Revenge lookup failed."));
        return readApiJson<{ target: Target | null }>(r, "Revenge lookup failed.");
      })
      .then((d) => {
        if (alive) setTarget(d.target);
      })
      .catch((e) => {
        if (alive) {
          setError(e instanceof Error ? e.message : "Revenge lookup failed.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Revenge summon failed."));
      const d = await readApiJson<{ boss_id: string }>(r, "Revenge summon failed.");
      router.push(`/boss/${d.boss_id}?revenge=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revenge summon failed.");
      setSummoning(false);
      summonRef.current = false;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Rematch"
        title={<>Revenge <span className="arena-title">boss</span></>}
        sub="Forged from your own misses: your most-missed skill, five fresh questions that avoid your recent ones."
      />
      {target === undefined && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Finding your misses">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Counting your misses…</p>
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
              Retry lookup
            </button>
            <Link href="/arena" className="arena-btn-ghost inline-block rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
              Back to arena
            </Link>
          </div>
        </div>
      ) : null}
      {target ? (
        <div className="arena-enter arena-card relative overflow-hidden rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-red-400 uppercase">Your most-missed skill</p>
          <p className="font-display mt-1 text-2xl font-black text-zinc-50">{target.skill_name}</p>
          <p className="arena-num mt-1 text-sm text-zinc-400">
            <span className="font-bold text-red-300">{target.wrong_count}</span>{" "}
            {target.wrong_count === 1 ? "miss" : "misses"} on record
          </p>
          <button
            type="button"
            onClick={summon}
            disabled={summoning}
            className="arena-btn-primary mt-4 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
          >
            {summoning ? "Forging rematch…" : "Summon revenge boss"}
          </button>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">Fresh verified set — avoids your recent questions.</p>
        </div>
      ) : null}
      {target ? (
        <Link href="/misses" className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
          Or drill the exact questions you missed
        </Link>
      ) : null}
      {target === null && !error ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Clean record.</p>
          <p className="text-sm text-zinc-400">No misses yet — fight a boss first, then come back for revenge.</p>
          <Link href="/arena" className="arena-btn-primary rounded-full px-5 py-2 text-sm font-bold text-white">
            Find a boss
          </Link>
        </div>
      ) : null}
    </main>
  );
}

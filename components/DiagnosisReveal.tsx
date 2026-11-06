"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { skillName } from "@/lib/graph/skills";
import MathText from "@/components/MathText";
import TimePortalCard from "@/components/TimePortalCard";
import { playRevealChime } from "@/lib/game/chime";

export type Diagnosis = {
  items: Array<{ cau_hoi: string; dap_an_sinh_vien: string; skill_tag: string[] }>;
  weak_skill: string;
  root_cause: string;
  confidence: number;
  can_summon: boolean;
};

// One orchestrated reveal: evidence photo, problems staggering in, then the
// weak→root verdict with a counting confidence bar and a chiming entrance.
export default function DiagnosisReveal({
  result,
  preview,
  summoning,
  onSummon,
  sample,
}: {
  result: Diagnosis;
  preview: string;
  summoning: boolean;
  onSummon: () => void;
  sample?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [pct, setPct] = useState(0);
  const target = Math.round(result.confidence * 100);
  const [whyOpen, setWhyOpen] = useState(false);
  const [whyLoading, setWhyLoading] = useState(false);
  const [why, setWhy] = useState<{ title: string; body: string; fix_steps: string[] } | null>(null);

  async function loadWhy() {
    if (why || whyLoading) return;
    setWhyLoading(true);
    try {
      const r = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weak_skill: result.weak_skill, root_cause: result.root_cause }),
      });
      if (r.ok) setWhy((await r.json()) as { title: string; body: string; fix_steps: string[] });
    } catch {
      // Silent: the expander simply stays shut on failure.
    } finally {
      setWhyLoading(false);
    }
  }

  useEffect(() => {
    playRevealChime();
    const t = setTimeout(() => setShown(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!shown) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = true;
    }
    let raf = 0;
    if (reduce) {
      raf = requestAnimationFrame(() => setPct(target));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      setPct(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, target]);

  return (
    <section className="flex flex-col gap-3" aria-label="Diagnosis result">
      <div className="arena-pop arena-card overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-4 p-5 sm:flex-row">
          {preview ? (
            <div className="relative mx-auto w-full max-w-56 shrink-0 overflow-hidden rounded-xl ring-1 ring-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="scanned work" className="max-h-44 w-full object-cover" />
              <div className="arena-scan-once" />
              <p className="absolute bottom-1 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-emerald-300 uppercase">
                Evidence
              </p>
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
              AI read {result.items.length} problem{result.items.length === 1 ? "" : "s"}
            </p>
            <div className="mt-2 flex max-h-44 flex-col gap-2 overflow-y-auto pr-1">
              {result.items.map((it, i) => (
                <div
                  key={i}
                  style={{ animationDelay: `${Math.min(i, 5) * 140}ms` }}
                  className="arena-enter rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5"
                >
                  <MathText text={it.cau_hoi} className="text-sm text-zinc-200" />
                  {it.skill_tag.length > 0 ? (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {it.skill_tag.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400"
                        >
                          {skillName(t)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-800 bg-red-950/20 p-5">
          <p className="text-xs font-bold tracking-widest text-red-400 uppercase">The verdict</p>
          <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="arena-pop flex-1 rounded-xl border border-red-500/60 bg-red-950/60 px-4 py-3 text-center">
              <p className="text-[10px] font-bold tracking-widest text-red-400/80 uppercase">Weak skill</p>
              <p title={result.weak_skill} className="font-display mt-0.5 text-lg font-extrabold text-red-100">
                {skillName(result.weak_skill)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="arena-flowline h-8 w-1 rounded-full sm:h-1 sm:w-14" aria-hidden="true" />
              <span className="text-[11px] font-bold tracking-widest whitespace-nowrap text-zinc-500 uppercase">
                rooted in
              </span>
              <div className="arena-flowline h-8 w-1 rounded-full sm:h-1 sm:w-14" aria-hidden="true" />
            </div>
            <div
              style={{ animationDelay: "200ms" }}
              className="arena-pop flex-1 rounded-xl border border-amber-500/60 bg-amber-950/60 px-4 py-3 text-center"
            >
              <p className="text-[10px] font-bold tracking-widest text-amber-400/80 uppercase">Root cause</p>
              <p title={result.root_cause} className="font-display mt-0.5 text-lg font-extrabold text-amber-100">
                {skillName(result.root_cause)}
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-expanded={whyOpen}
            onClick={() => {
              setWhyOpen((o) => !o);
              void loadWhy();
            }}
            className="mt-3 w-full rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
          >
            {whyOpen ? "Hide: why this root?" : "Why this root?"}
          </button>
          {whyOpen ? (
            <div className="mt-2 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
              {whyLoading ? (
                <p className="text-sm text-zinc-500">Asking the tutor…</p>
              ) : why ? (
                <>
                  <p className="text-sm font-bold text-amber-200">{why.title}</p>
                  <p className="mt-1 text-sm text-zinc-300">{why.body}</p>
                  <ul className="mt-2 flex list-none flex-col gap-1">
                    {why.fix_steps.map((s, i) => (
                      <li key={i} className="text-sm text-zinc-300">
                        <span className="font-bold text-emerald-300">{i + 1}.</span> {s}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Could not load the explanation. Try again.</p>
              )}
            </div>
          ) : null}
          {sample ? (
            <p className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-2 text-center text-xs font-bold tracking-widest text-emerald-300 uppercase">
              Cached sample — no AI wait
            </p>
          ) : (
          <div className="mt-4 flex items-center gap-2">
            <div
              className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-800"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Diagnosis confidence"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="arena-num font-display text-xl font-extrabold text-emerald-300">{pct}%</span>
          </div>
          )}

          <div className="mt-4 border-t border-zinc-800 pt-3">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Your patch plan</p>
            <ol className="mt-2 flex flex-col gap-2">
              <li className="flex items-start gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-300">
                  1
                </span>
                <span className="text-zinc-300">
                  Rebuild the root: {skillName(result.root_cause)} — 10 minutes of basics unlocks
                  everything above it.
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-300">
                  2
                </span>
                <span className="text-zinc-300">
                  Attack the weakness: {skillName(result.weak_skill)} — summon the boss below and slay
                  5 questions to close it.
                </span>
              </li>
            </ol>
          </div>
          <TimePortalCard weak={result.weak_skill} root={result.root_cause} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {result.can_summon ? (
              <button
                onClick={onSummon}
                disabled={summoning}
                className="arena-btn-primary arena-cta-pulse font-display rounded-full px-7 py-3 text-base font-bold text-white disabled:opacity-40 disabled:shadow-none"
              >
                {summoning ? "Forging 5 questions, verifying answers…" : "⚔ Summon boss"}
              </button>
            ) : (
              <p className="text-sm text-zinc-500">Low confidence — retake a clearer photo.</p>
            )}
            <Link
              href={"/graph?weak=" + result.weak_skill + "&root=" + result.root_cause}
              className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
            >
              View on skill graph
            </Link>
            <Link
              href={"/paper?skill=" + result.weak_skill}
              className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
            >
              Forge practice paper
            </Link>
            <Link
              href="/streak"
              className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
            >
              View your streak
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

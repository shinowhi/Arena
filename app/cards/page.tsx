"use client";
import { useEffect, useState } from "react";
import katex from "katex";
import { skillName } from "@/lib/graph/skills";
import { FORMULAS } from "@/lib/game/formulas";

type Entry = { skill: string; patched: boolean };

const STORE_KEY = "arena_cards_v1";
const INTERVALS = [1, 3, 7, 14, 30]; // days per stage
type Progress = Record<string, { stage: number; due: string }>;

function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as Progress;
  } catch {
    return {};
  }
}

function tex(formula: string): string {
  try {
    return katex.renderToString(formula, { throwOnError: false });
  } catch {
    return "";
  }
}

export default function CardsPage() {
  const [unlocked, setUnlocked] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [flipped, setFlipped] = useState(false);
  // Current time is read after paint only — reading it during render breaks static prerender.
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setNowMs(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/diary")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        setUnlocked((d.entries as Entry[]).filter((e) => e.patched).map((e) => e.skill));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, []);

  function save(next: Progress) {
    setProgress(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function review(skill: string, remembered: boolean) {
    const cur = progress[skill] ?? { stage: 0, due: "" };
    const stage = remembered ? Math.min(cur.stage + 1, INTERVALS.length - 1) : 0;
    const due = new Date(Date.now() + INTERVALS[stage] * 86400000).toISOString();
    save({ ...progress, [skill]: { stage, due } });
    setFlipped(false);
  }

  const dueSkills = (unlocked ?? []).filter((s) => {
    const p = progress[s];
    return !p || new Date(p.due).getTime() <= nowMs;
  });
  const current = dueSkills[0] ?? null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <div>
        <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Smart card box</p>
        <h1 className="font-display text-3xl font-extrabold text-zinc-100">Flip before you forget</h1>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {(unlocked === null || nowMs === 0) && !error ? <p className="text-zinc-500">Opening your card box…</p> : null}
      {unlocked !== null && nowMs > 0 ? (
        <>
          {current ? (
            <div className="arena-card rounded-2xl p-6 text-center">
              <p className="text-xs text-zinc-500">
                {dueSkills.length} due · stage {(progress[current]?.stage ?? 0) + 1}/{INTERVALS.length}
              </p>
              {!flipped ? (
                <button
                  type="button"
                  onClick={() => setFlipped(true)}
                  className="mt-3 w-full rounded-xl border border-zinc-700 p-6"
                >
                  <p className="text-lg font-bold text-zinc-100">{skillName(current)}</p>
                  <p className="mt-1 text-xs text-zinc-500">Tap to reveal the formula</p>
                </button>
              ) : (
                <div>
                  <div
                    className="mt-3 overflow-x-auto rounded-xl border border-zinc-700 p-6 text-zinc-100"
                    dangerouslySetInnerHTML={{ __html: tex(FORMULAS[current] ?? current) }}
                  />
                  <div className="mt-3 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => review(current, false)}
                      className="arena-btn-ghost rounded-full px-5 py-2 text-sm text-zinc-200"
                    >
                      Again
                    </button>
                    <button
                      type="button"
                      onClick={() => review(current, true)}
                      className="arena-btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="arena-card rounded-2xl p-4 text-sm text-zinc-400">
              {unlocked.length === 0
                ? "No cards yet — slay a boss to unlock your first formula card."
                : "All caught up. Come back tomorrow."}
            </p>
          )}
          {unlocked.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-zinc-300">
                Collection ({unlocked.length}/36)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unlocked.map((s) => {
                  const p = progress[s];
                  const due = !p || new Date(p.due).getTime() <= nowMs;
                  return (
                    <span
                      key={s}
                      title={`${skillName(s)} — stage ${(p?.stage ?? 0) + 1}`}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        due
                          ? "border-amber-500/60 bg-amber-950/60 text-amber-200"
                          : "border-zinc-700 bg-zinc-900/70 text-zinc-400"
                      }`}
                    >
                      {skillName(s)}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          <nav className="flex gap-4 text-sm">
            <a href="/diary" className="underline text-zinc-300">
              Root diary
            </a>
            <a href="/arena" className="underline text-zinc-300">
              Back to arena
            </a>
          </nav>
        </>
      ) : null}
    </main>
  );
}

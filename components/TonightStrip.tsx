"use client";

import { useEffect, useState } from "react";

// The one bespoke hero move (U2): a live battle-status strip. Real counts from
// our own APIs — bosses alive, hunters grinding, solved tonight. Client fetch,
// fail-soft (renders nothing on error), prerender-safe (no Date/random in render).
export default function TonightStrip() {
  // Independent fetches: the strip appears as soon as bosses arrive instead
  // of waiting for the slower API; ghosts fill in when ready.
  const [bosses, setBosses] = useState<number | null>(null);
  const [ghosts, setGhosts] = useState<{ hunters: number; solved: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let bossesDone = false;
    fetch("/api/arena/active-bosses", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!alive) return;
        bossesDone = true;
        if (!b || !Array.isArray(b.bosses)) setFailed(true);
        else setBosses(b.bosses.length);
      })
      .catch(() => {
        if (alive) {
          bossesDone = true;
          setFailed(true);
        }
      });
    fetch("/api/ghosts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (!alive) return;
        if (g && typeof g.ghosts === "number") {
          setGhosts({
            hunters: g.ghosts,
            solved: typeof g.solvedTonight === "number" ? g.solvedTonight : 0,
          });
        }
      })
      .catch(() => {});
    const timer = setTimeout(() => {
      if (alive && !bossesDone) setFailed(true);
    }, 10000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  if (failed) return null;
  if (bosses === null) {
    return (
      <div aria-hidden="true" className="arena-enter arena-d3 flex items-center gap-2">
        <span className="arena-shimmer h-5 w-44 rounded-full" />
      </div>
    );
  }
  return (
    <p aria-live="polite" className="arena-enter arena-d3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-400">
      <span className="arena-livedot" aria-hidden="true" />
      <span className="font-semibold text-zinc-200 tabular-nums">{bosses} {bosses === 1 ? "boss" : "bosses"} alive</span>
      {ghosts ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{ghosts.hunters} {ghosts.hunters === 1 ? "hunter" : "hunters"} grinding</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{ghosts.solved} solved tonight</span>
        </>
      ) : null}
    </p>
  );
}

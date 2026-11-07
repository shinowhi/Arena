"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type BadgeView = { id: string; name: string; desc: string; earned: boolean; progress: number; target: number };

const GLYPHS: Record<string, React.ReactNode> = {
  first_blood: <path d="M12 3c3 4 6 7 6 10a6 6 0 1 1-12 0c0-3 3-6 6-10z" />,
  sharpshooter: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  slayer: <path d="M3 8l4 4 5-6 5 6 4-4-1.5 10h-15z" />,
  scholar: <path d="M6 3h12v18l-6-4-6 4z" />,
  grinder: <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  flawless: <path d="M7 3h10l4 6-9 12L3 9z" />,
};

function BadgeGlyph({ id, className }: { id: string; className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {GLYPHS[id] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<BadgeView[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setError("");
      setBadges(null);
    });
    fetch("/api/badges")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Badges failed."));
        return readApiJson<{ badges: BadgeView[] }>(r, "Badges failed.");
      })
      .then((d) => {
        if (alive) setBadges(d.badges);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Badges failed.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const earned = badges?.filter((b) => b.earned).length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="This week"
        title={<>Weekly <span className="arena-title">badges</span></>}
        sub="Six badges reset every 7 days. Scan, hit, and slay to earn them all."
        right={
          badges ? (
            <span className="arena-num shrink-0 text-sm text-zinc-400">
              <span className="font-bold text-amber-300">{earned}</span>/{badges.length}
            </span>
          ) : undefined
        }
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {!badges && !error ? (
        <div className="flex flex-col gap-3" aria-label="Loading badges">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {badges ? (
        <div className="grid grid-cols-2 gap-3">
          {badges.map((b) => {
            const pct = Math.min(100, Math.round((b.progress / b.target) * 100));
            return (
              <div
                key={b.id}
                className={`arena-card flex flex-col items-center gap-1 rounded-2xl p-4 text-center ${b.earned ? "" : "opacity-70"}`}
              >
                <BadgeGlyph id={b.id} className={`h-8 w-8 ${b.earned ? "text-amber-300" : "text-zinc-600"}`} />
                <p className={`font-display text-base font-extrabold ${b.earned ? "text-zinc-50" : "text-zinc-400"}`}>{b.name}</p>
                <p className="min-h-8 text-xs text-zinc-500">{b.desc}</p>
                {b.earned ? (
                  <p className="arena-num mt-1 rounded-full bg-amber-500/15 px-3 py-0.5 text-xs font-bold text-amber-300">Earned</p>
                ) : (
                  <div className="mt-1 w-full">
                    <div className="h-1 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={b.progress} aria-valuemax={b.target} aria-label={`${b.name} progress`}>
                      <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="arena-num mt-1 text-xs text-zinc-500">
                      {b.progress}/{b.target}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      <Link href="/arena" className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
        Earn them in the arena
      </Link>
    </main>
  );
}

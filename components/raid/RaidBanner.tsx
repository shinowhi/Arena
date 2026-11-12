"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Raid = {
  id: string;
  skill_tag: string;
  name: string;
  rarity: string;
  current_hp: number;
  max_hp: number;
  despawn_at: string;
  seconds_left: number;
};

// Total-minutes mm:ss countdown (3h window, e.g. 179:04).
function fmt(totalSec: number): string {
  const s = Math.max(0, totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Light-FOMO raid banner: shows the soonest-expiring live raid with a
// ticking countdown, linking to the fight. Renders nothing when no raid is
// live or the feed is unreachable.
export default function RaidBanner() {
  const [raid, setRaid] = useState<Raid | null>(null);
  // Prerender-safe clock: Date.now() in an initializer breaks the build.
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/raids");
        if (!res.ok) return;
        const body = (await res.json()) as { raids?: Raid[] };
        const list = (body.raids ?? []).filter((r) => Date.parse(r.despawn_at) > Date.now());
        list.sort((a, b) => Date.parse(a.despawn_at) - Date.parse(b.despawn_at));
        if (alive) setRaid(list[0] ?? null);
      } catch {
        // Offline or feed down: the banner stays hidden.
      }
    }
    void load();
    const refetch = setInterval(() => void load(), 30000);
    const tick = setInterval(() => {
      if (alive) setNow(Date.now());
    }, 1000);
    return () => {
      alive = false;
      clearInterval(refetch);
      clearInterval(tick);
    };
  }, []);

  if (!raid) return null;
  const left = Math.floor((Date.parse(raid.despawn_at) - now) / 1000);
  if (left <= 0) return null;
  const pct =
    raid.max_hp > 0 ? Math.max(0, Math.min(100, (raid.current_hp / raid.max_hp) * 100)) : 0;

  return (
    <Link
      href={`/boss/${encodeURIComponent(raid.id)}`}
      className="arena-card flex min-h-[48px] items-center gap-3 rounded-2xl border-red-800/60 bg-gradient-to-r from-red-950/60 via-zinc-900 to-zinc-900 px-4 py-3"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[10px] font-bold tracking-widest text-red-300 uppercase">
          Raid boss · ends in <span role="timer">{fmt(left)}</span>
        </span>
        <span className="truncate text-sm font-semibold text-zinc-100">{raid.name}</span>
        <span
          className="h-1.5 overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-label={`${raid.name} health`}
          aria-valuenow={raid.current_hp}
          aria-valuemin={0}
          aria-valuemax={raid.max_hp}
        >
          <span className="block h-full rounded-full bg-gradient-to-r from-red-500 to-amber-400" style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-xs font-bold text-white">
        Fight
      </span>
    </Link>
  );
}

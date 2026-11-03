"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlameIcon } from "@/components/icons";

// Fixed badge, top-right of the home page. Shows the live streak count
// from our own /api/streak (Supabase-backed). Falls back to fire-only.
export default function StreakBadge() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/streak", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data && typeof data.streak === "number") setCount(data.streak);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // F10: a 0-day streak is softened, not shouted — no glow, muted tone.
  const zero = count === 0;
  return (
    <Link
      href="/streak"
      aria-label={zero ? "Open healing streak (no streak yet)" : "Open healing streak"}
      className={`fixed top-3 right-3 z-50 flex items-center gap-2 rounded-full px-5 py-3 text-base font-black tracking-widest tabular-nums ${
        zero
          ? "border border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200"
          : "arena-float bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-[0_0_24px_rgba(245,158,11,0.6)] hover:brightness-110"
      }`}
    >
      <FlameIcon className="h-5 w-5" />
      {count}
    </Link>
  );
}
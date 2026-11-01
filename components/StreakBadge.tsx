"use client";

import { useEffect, useState } from "react";

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
  return (
    <a
      href="/streak"
      aria-label="Open healing streak"
      className="arena-float fixed top-3 right-3 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-black tracking-widest text-white tabular-nums shadow-[0_0_24px_rgba(245,158,11,0.6)] hover:brightness-110"
    >
      <span aria-hidden="true">🔥</span>
      {count}
    </a>
  );
}
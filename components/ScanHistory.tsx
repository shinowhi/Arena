"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { skillName } from "@/lib/graph/skills";

// M1: recent scans, rendered on home. Written by the scan page (B's M2)
// under key arena:recent-scans: max 8, newest-first, each
// {ts, mode: exam|life, skill, bossId, thumb}. Empty or unreadable -> null.
const KEY = "arena:recent-scans";
const STAGGER = ["arena-d1", "arena-d2", "arena-d3", "arena-d4"];

type Entry = { ts: number; mode: string; skill: string; bossId: string; thumb: string };

function ago(ts: number): string {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}

function read(): Entry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is Entry =>
        !!e && typeof e === "object" && typeof (e as Entry).bossId === "string" && typeof (e as Entry).ts === "number"
    );
  } catch {
    return [];
  }
}

export default function ScanHistory() {
  const [items, setItems] = useState<Entry[] | null>(null);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) setItems(read());
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <div className="w-full pt-10 text-left">
      <p className="arena-kicker">Recent scans</p>
      <p className="font-display mt-1 text-2xl font-extrabold">Jump back in</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((e, i) => (
          <Link
            key={e.bossId + e.ts}
            href={"/boss/" + e.bossId}
            className={"arena-enter arena-card group flex items-center gap-3 rounded-2xl p-3 transition-all hover:-translate-y-0.5 " + STAGGER[i % 4]}
          >
            {e.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.thumb} alt="" aria-hidden="true" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xl">
                {e.mode === "life" ? "🌍" : "📸"}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-zinc-100">{skillName(e.skill)}</span>
              <span className="block text-xs text-zinc-500">
                {e.mode === "life" ? "Real life" : "Exam"} · {ago(e.ts)}
              </span>
            </span>
            <span aria-hidden="true" className="ml-auto text-zinc-600 transition-transform group-hover:translate-x-1">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
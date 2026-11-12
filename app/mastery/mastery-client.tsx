"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import RaidBanner from "@/components/raid/RaidBanner";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Skill = {
  tag: string;
  name: string;
  mastery: number | null;
  status: "solid" | "shaky" | "weak" | "new";
  trend: "up" | "flat" | "down";
  total: number;
  right: number;
  last_at: string | null;
};

type TodayItem = { label: string; href: string; reason: "due" | "weak" | "shaky" | "new" };

const GROUPS = [
  { status: "weak", title: "Needs work" },
  { status: "shaky", title: "Almost solid" },
  { status: "solid", title: "Solid" },
  { status: "new", title: "New" },
] as const;

const REASON_LABEL: Record<TodayItem["reason"], string> = {
  due: "Due for review",
  weak: "Needs work",
  shaky: "Almost solid",
  new: "New",
};

const TREND = {
  up: { glyph: "↑", label: "trending up", cls: "text-emerald-300" },
  flat: { glyph: "→", label: "steady", cls: "text-zinc-500" },
  down: { glyph: "↓", label: "trending down", cls: "text-red-300" },
} as const;

function relativeTime(iso: string | null): string {
  if (!iso) return "Not yet practiced";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "Not yet practiced";
  if (ms < 0) return "Just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US");
}

export default function MasteryClient() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [items, setItems] = useState<TodayItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/mastery").then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Could not load mastery."));
        return readApiJson<{ skills: Skill[] }>(r, "Could not load mastery.");
      }),
      fetch("/api/mastery/today").then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Could not load today's practice."));
        return readApiJson<{ items: TodayItem[] }>(r, "Could not load today's practice.");
      }),
    ])
      .then(([m, t]) => {
        if (!alive) return;
        setSkills(m.skills);
        setItems(t.items);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Could not load mastery.");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="arena-enter rounded-2xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
        {error}
      </p>
    );
  }

  if (skills === null || items === null) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading mastery">
        <div className="arena-shimmer h-24 rounded-2xl" />
        <div className="arena-shimmer h-16 rounded-2xl" />
        <div className="arena-shimmer h-16 rounded-2xl" />
      </div>
    );
  }

  return (
    <>
      <RaidBanner />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold tracking-widest text-zinc-500 uppercase">Practice today</h2>
        {items.map((it) => (
          <Link
            key={`${it.reason}:${it.href}`}
            href={it.href.startsWith("/drill") ? it.href : "/drill"}
            className="arena-card flex min-h-[48px] items-center justify-between gap-3 rounded-2xl px-4 py-3"
          >
            <span className="min-w-0 text-sm font-semibold text-zinc-100">{it.label}</span>
            <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-sky-200 uppercase">
              {REASON_LABEL[it.reason] ?? it.reason}
            </span>
          </Link>
        ))}
      </section>

      {skills.length === 0 ? (
        <div className="arena-card flex flex-col gap-3 rounded-2xl p-5">
          <p className="text-sm text-zinc-400">
            No practice data yet — forge a drill to start building mastery.
          </p>
          <Link
            href="/drill"
            className="arena-btn-primary inline-block min-h-[48px] rounded-full px-5 py-3 text-center text-sm font-bold text-white"
          >
            Start a drill
          </Link>
        </div>
      ) : null}

      {GROUPS.map((g) => {
        const rows = skills.filter((s) => s.status === g.status);
        if (rows.length === 0) return null;
        return (
          <section key={g.status} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold tracking-widest text-zinc-500 uppercase">
              {g.title} · {rows.length}
            </h2>
            {rows.map((s) => {
              const t = TREND[s.trend];
              return (
                <div key={s.tag} className="arena-card flex flex-col gap-2 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{s.name}</p>
                    <p className="flex shrink-0 items-center gap-2">
                      <span aria-label={t.label} title={t.label} className={`text-base font-bold ${t.cls}`}>
                        {t.glyph}
                      </span>
                      <span className="arena-num text-sm font-bold text-zinc-100">
                        {s.mastery === null ? "New" : `${s.mastery}%`}
                      </span>
                    </p>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-zinc-800"
                    role="progressbar"
                    aria-label={`${s.name} mastery`}
                    aria-valuenow={s.mastery ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
                      style={{ width: `${s.mastery ?? 0}%` }}
                    />
                  </div>
                  <div className="flex min-h-[48px] items-center justify-between gap-3">
                    <p className="text-xs text-zinc-500">
                      {s.right}/{s.total} right · {relativeTime(s.last_at)}
                    </p>
                    {s.status === "weak" ? (
                      <Link
                        href={`/drill?skill=${encodeURIComponent(s.tag)}`}
                        className="arena-btn-primary inline-block min-h-[48px] rounded-full px-5 py-3 text-center text-xs font-bold text-white"
                      >
                        Practice
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

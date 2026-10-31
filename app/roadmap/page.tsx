"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface WeakEntry {
  tag: string;
  name: string;
  misses: number;
  healed: boolean;
}

const DAYS = 30;
const CHECK_PREFIX = "roadmap-check-";

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function loadChecks(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECK_PREFIX + "all");
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export default function RoadmapPage() {
  const router = useRouter();
  const [weak, setWeak] = useState<WeakEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState<Set<string>>(new Set());
  const [summoning, setSummoning] = useState("");
  // Current time is read after paint only — reading it during render breaks static prerender.
  const [todayMs, setTodayMs] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setTodayMs(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/countdown");
        const data = (await res.json().catch(() => null)) as { weak?: WeakEntry[]; error?: string } | null;
        if (!alive) return;
        if (!res.ok || !data || !Array.isArray(data.weak)) {
          throw new Error(data?.error ?? "Could not load your plan.");
        }
        setWeak(data.weak);
        setChecks(loadChecks());
        setLoaded(true);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Could not load your plan.");
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  function toggleCheck(key: string) {
    setChecks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(CHECK_PREFIX + "all", JSON.stringify([...next]));
      } catch {
        /* private mode: checks just don't persist */
      }
      return next;
    });
  }

  async function summon(tag: string) {
    if (summoning) return;
    setSummoning(tag);
    setError("");
    try {
      const res = await fetch("/api/boss/summon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_tag: tag }),
      });
      const data = (await res.json().catch(() => null)) as { boss_id?: string; error?: string } | null;
      if (!res.ok || !data?.boss_id) throw new Error(data?.error ?? "Summon failed.");
      router.push(`/boss/${data.boss_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summon failed.");
      setSummoning("");
    }
  }

  const todayKey = todayMs > 0 ? dateKey(new Date(todayMs)) : "";
  const open = weak.filter((w) => !w.healed);
  const focusList = open.length > 0 ? open : weak; // review mode when everything is healed
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(todayMs + i * 86400000);
    const focus = focusList.length > 0 ? focusList[i % focusList.length]! : null;
    return { date: d, key: dateKey(d), focus };
  });
  const checkedCount = days.filter((d) => checks.has(d.key)).length;
  const todayDone = checks.has(todayKey);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← Back</Link>
      <h1 className="font-display mt-2 text-3xl font-extrabold text-zinc-100">30-day roadmap</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Built from your scan history, weakest skill first. Fight one focus a day, check it off, and
        watch the list shrink.
      </p>

      {loaded && focusList.length === 0 && !error && (
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
          <p className="text-zinc-200">No weak skills yet — the roadmap needs data first.</p>
          <Link
            href="/scan"
            className="mt-3 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
          >
            Scan homework to begin
          </Link>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {loaded && todayMs > 0 && focusList.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className={`rounded-full px-3 py-1 font-semibold ${todayDone ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-300"}`}>
              {todayDone ? "✓ Today checked — streak protected" : "○ Today not checked yet"}
            </span>
            <span className="text-zinc-400">
              {checkedCount}/{DAYS} days checked · {open.length} open weakness{open.length === 1 ? "" : "es"}
              {open.length === 0 && " — review mode 🎉"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {days.map((d, i) => {
              const done = checks.has(d.key);
              const isToday = d.key === todayKey;
              return (
                <article
                  key={d.key}
                  className={`rounded-xl border p-3 ${isToday ? "border-amber-600 bg-amber-950/20" : "border-zinc-800 bg-zinc-900/40"} ${done ? "opacity-80" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-zinc-400">
                      {i === 0 ? "Today" : d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    <button
                      onClick={() => toggleCheck(d.key)}
                      title={done ? "Uncheck" : "Check in"}
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-sm ${done ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-zinc-700 text-zinc-600 hover:border-zinc-500"}`}
                    >
                      {done ? "✓" : ""}
                    </button>
                  </div>
                  {d.focus && (
                    <>
                      <p className="mt-2 min-h-8 text-sm font-semibold text-zinc-100">
                        {d.focus.healed ? "↻ " : ""}{d.focus.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {d.focus.healed ? "review" : `${d.focus.misses} miss${d.focus.misses === 1 ? "" : "es"}`}
                      </p>
                      <button
                        onClick={() => void summon(d.focus!.tag)}
                        disabled={summoning !== ""}
                        className="mt-2 w-full rounded-lg bg-red-600/80 px-2 py-1 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {summoning === d.focus.tag ? "Summoning…" : "⚔ Fight"}
                      </button>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

type Entry = {
  skill: string;
  name: string;
  fails: number;
  hits: number;
  slainAt: string | null;
  patched: boolean;
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DiaryPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/diary")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        setEntries(d.entries as Entry[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Root diary"
        title="Every root you patched"
        sub="Your battle history, skill by skill."
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {!entries && !error ? <p className="text-zinc-500">Opening your diary…</p> : null}
      {entries && entries.length === 0 ? (
        <p className="text-zinc-500">No battles yet. Slay your first boss and it lands here.</p>
      ) : null}
      {entries && entries.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.skill} className="arena-card flex items-start gap-3 rounded-2xl p-4">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  e.patched ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                }`}
              >
                {e.patched ? "✓" : "…"}
              </span>
              <div>
                <p className="font-semibold text-zinc-100">{e.name}</p>
                <p className="text-sm text-zinc-400">
                  {e.patched && e.slainAt
                    ? `${shortDate(e.slainAt)}: slew it ${
                        e.fails > 0 ? `after ${e.fails} ${e.fails === 1 ? "fail" : "fails"}` : "flawless — first try!"
                      }`
                    : `Still fighting — ${e.hits} ${e.hits === 1 ? "hit" : "hits"} so far.`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <nav className="flex gap-4 text-sm">
        <Link href="/streak" className="underline text-zinc-300">
          Your streak
        </Link>
        <Link href="/scan" className="underline text-zinc-300">
          Scan new work
        </Link>
      </nav>
    </main>
  );
}

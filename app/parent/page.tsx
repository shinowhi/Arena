"use client";

import { useEffect, useState } from "react";
import Stat from "@/components/ui/Stat";
import PageHeader from "@/components/ui/PageHeader";

interface Stats {
  scans: number;
  skillsSlain: number;
  streakDays: number;
  activeDays: number;
  topWeak: { id: string; name: string; misses: number } | null;
}
type Report =
  | { role: "parent"; stats: Stats }
  | { role: "child"; linked: boolean; stats: Stats }
  | { role: "none"; stats: Stats };

function StatCard({ label, value }: { label: string; value: string | number }) {
  return <Stat label={label} value={value} />;
}

export default function ParentPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [code, setCode] = useState("");
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/parent/report");
        const data = (await res.json().catch(() => null)) as (Report & { needsMigration?: boolean }) | null;
        if (!alive || !data) return;
        if (data.needsMigration) {
          setNeedsMigration(true);
          return;
        }
        if ("role" in data) setReport(data);
      } catch {
        if (alive) setMsg("Could not load the report. Check your connection and reload.");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [bump]);

  async function mintCode() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/parent/link-code", { method: "POST" });
      const data = (await res.json()) as { code?: string; error?: string; needsMigration?: boolean };
      if (data.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok || !data.code) throw new Error(data.error ?? "Could not create a code.");
      setCode(data.code);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create a code.");
    } finally {
      setBusy(false);
    }
  }

  async function claimCode() {
    if (busy || !claim.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/parent/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: claim.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; needsMigration?: boolean };
      if (data.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Claim failed.");
      setClaim("");
      setMsg("Linked! This device now sees the child's report.");
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader
        kicker="For parents"
        title="Parent report"
        sub="Link a parent device with a one-time code — no accounts, no emails. The parent only ever sees progress numbers, never answers."
      />

      {needsMigration && (
        <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Parent linking needs a database update (migration 0005) — ask the site owner to run it in
          Supabase. Stats below still work.
        </div>
      )}

      {report?.role === "parent" && (
        <section className="mt-6 rounded-2xl border border-emerald-800 bg-emerald-950/30 p-5">
          <p className="text-sm font-semibold text-emerald-300">Your child&apos;s progress</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Problems scanned" value={report.stats.scans} />
            <StatCard label="Skills conquered" value={report.stats.skillsSlain} />
            <StatCard label="Day streak" value={report.stats.streakDays} />
            <StatCard label="Active days" value={report.stats.activeDays} />
          </div>
          <p className="mt-4 text-sm text-zinc-300">
            {report.stats.topWeak ? (
              <>Needs the most help with: <strong className="text-amber-300">{report.stats.topWeak.name}</strong> ({report.stats.topWeak.misses} misses still open).</>
            ) : (
              <>Nothing open right now — every weak skill found so far has been conquered. 🎉</>
            )}
          </p>
        </section>
      )}

      {(report?.role === "child" || report?.role === "none") && (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm font-semibold text-zinc-200">Are you the student?</p>
          {report.role === "child" && report.linked ? (
            <p className="mt-2 text-sm text-emerald-300">
              ✓ A parent device is linked — they can see your progress numbers.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-400">
                Create a one-time code, then type it on your parent&apos;s device below.
              </p>
              <button
                onClick={mintCode}
                disabled={busy || needsMigration}
                className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {busy ? "Working…" : "Create link code"}
              </button>
              {code && (
                <p className="mt-3 text-center text-4xl font-black tracking-[0.3em] text-amber-300">
                  {code}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {report?.role !== "parent" && (
        <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <p className="text-sm font-semibold text-zinc-200">Are you the parent?</p>
          <p className="mt-1 text-sm text-zinc-400">Type the code from your child&apos;s device:</p>
          <div className="mt-2 flex gap-2">
            <input
              value={claim}
              onChange={(e) => setClaim(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={12}
              aria-label="Parent link code"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-lg font-bold tracking-[0.2em] text-zinc-100"
            />
            <button
              onClick={claimCode}
              disabled={busy || needsMigration || !claim.trim()}
              className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              Link
            </button>
          </div>
        </section>
      )}

      {msg && <p className="mt-3 text-sm text-amber-300">{msg}</p>}

      {report && report.role !== "parent" && (
        <section className="mt-4">
          <p className="text-sm font-semibold text-zinc-300">Your own numbers</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Scans" value={report.stats.scans} />
            <StatCard label="Skills slain" value={report.stats.skillsSlain} />
            <StatCard label="Streak" value={report.stats.streakDays} />
            <StatCard label="Active days" value={report.stats.activeDays} />
          </div>
        </section>
      )}
    </main>
  );
}

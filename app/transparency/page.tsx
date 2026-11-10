"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Report = {
  windows: { bossH: number; examH: number };
  bossSets: { total: number; fresh12h: number };
  examSections: { total: number; fresh48h: number; verifiedQ: number; draftQ: number };
  newestFetch: string | null;
  method: string[];
};

export default function TransparencyPage() {
  const [rep, setRep] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/transparency")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Report failed."));
        return readApiJson<Report>(r, "Report failed.");
      })
      .then((d) => {
        if (alive) setRep(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Report failed.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const stat = (label: string, value: string | number) => (
    <div className="arena-card rounded-2xl p-5 text-center">
      <p className="arena-num text-3xl font-extrabold text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{label}</p>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Trust, measured"
        title={<>AI <span className="arena-title">transparency</span></>}
        sub="Live numbers from the question bank. No mock data — reload and watch them move after each prime."
      />
      {error ? (
        <p role="alert" className="arena-card rounded-2xl p-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
      {!rep && !error ? (
        <div className="grid grid-cols-2 gap-3" role="status" aria-label="Loading report">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {rep ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {stat("Boss sets cached", rep.bossSets.total)}
            {stat(`Fresh (${rep.windows.bossH}h)`, rep.bossSets.fresh12h)}
            {stat("Verified exam Qs", rep.examSections.verifiedQ)}
            {stat("AI-draft exam Qs", rep.examSections.draftQ)}
          </div>
          <p className="text-center text-xs text-zinc-500">
            Exam sections {rep.examSections.fresh48h}/{rep.examSections.total} fresh ({rep.windows.examH}h)
            {rep.newestFetch ? ` · newest fetch ${rep.newestFetch.slice(0, 10)}` : ""}
          </p>
          <div className="arena-card rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">How a question earns its place</p>
            <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-sm text-zinc-300">
              {rep.method.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ol>
          </div>
        </>
      ) : null}
    </main>
  );
}

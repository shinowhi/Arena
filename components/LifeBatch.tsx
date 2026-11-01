"use client";

import MathText from "@/components/MathText";
import { skillName } from "@/lib/graph/skills";

export type LifeJobResult = { boss_id: string; skill_tag: string; problem_latex: string };

export type LifeJob = {
  key: string;
  file: File;
  url: string;
  thumb: string;
  status: "queued" | "forging" | "done" | "failed";
  result?: LifeJobResult;
  error?: string;
};

// L1: batch of up to 3 life photos. Each job forges its own boss; failures
// never block the rest. Thumbs + Fight links per finished job.
export default function LifeBatch({
  jobs,
  forging,
  onAdd,
  onRemove,
  onForge,
  onScreen,
}: {
  jobs: LifeJob[];
  forging: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onForge: () => void;
  onScreen: () => void;
}) {
  const queued = jobs.filter((j) => j.status === "queued" || j.status === "failed").length;
  return (
    <div className="arena-enter arena-d1 arena-card flex flex-col gap-3 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-200">
          Real-life batch <span className="arena-num text-zinc-500">({jobs.length}/3)</span>
        </p>
        <div className="flex gap-2">
          <label className="arena-btn-ghost cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium text-zinc-200">
            Add photos
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => {
                onAdd(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={onScreen}
            className="arena-btn-ghost rounded-full px-4 py-1.5 text-sm font-medium text-zinc-200"
          >
            Capture screen
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-center text-sm text-zinc-500">
          Add up to 3 photos — pizza, stairs, bridges — each becomes its own boss fight.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {jobs.map((j) => (
            <li key={j.key} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={j.url} alt="" aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-bold ${
                      j.status === "done"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : j.status === "failed"
                          ? "bg-red-500/20 text-red-300"
                          : j.status === "forging"
                            ? "animate-pulse bg-amber-500/20 text-amber-300"
                            : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {j.status === "done" ? "Done" : j.status === "failed" ? "Failed" : j.status === "forging" ? "Forging…" : "Queued"}
                  </span>
                  <span className="truncate text-zinc-500">{j.file.name}</span>
                </p>
                {j.status === "done" && j.result ? (
                  <div className="mt-1.5">
                    <MathText text={j.result.problem_latex} className="text-sm text-zinc-200" />
                    <p className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                        {skillName(j.result.skill_tag)}
                      </span>
                      <a
                        href={"/boss/" + j.result.boss_id}
                        className="arena-btn-primary rounded-full px-4 py-1 text-xs font-bold text-white"
                      >
                        ⚔ Fight
                      </a>
                    </p>
                  </div>
                ) : null}
                {j.status === "failed" ? <p className="mt-1 text-xs text-red-400">{j.error ?? "Forge failed."}</p> : null}
              </div>
              {!forging && j.status !== "forging" ? (
                <button
                  type="button"
                  onClick={() => onRemove(j.key)}
                  aria-label={`Remove ${j.file.name}`}
                  className="shrink-0 rounded-full px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        onClick={onForge}
        disabled={forging || queued === 0}
        className="arena-btn-primary font-display rounded-full px-5 py-3 text-base font-bold text-white disabled:opacity-40 disabled:shadow-none"
      >
        {forging ? "Forging bosses…" : queued > 0 ? `Forge ${queued} boss${queued === 1 ? "" : "es"}` : "Forge bosses"}
      </button>
    </div>
  );
}

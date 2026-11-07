"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Item = {
  boss_id: string;
  question_index: number;
  skill_tag: string;
  skill_name: string;
  level: number;
  prompt_latex: string;
  hint: string;
  check: unknown;
  tolerance: number;
  missed_at: string;
};
type Mark = "idle" | "checking" | "right" | "wrong";

export default function MissesPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setError("");
      setItems(null);
    });
    fetch("/api/misses")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Miss queue failed."));
        return readApiJson<{ items: Item[] }>(r, "Miss queue failed.");
      })
      .then((d) => {
        if (!alive) return;
        setItems(d.items);
        setAnswers(d.items.map(() => ""));
        setMarks(d.items.map(() => "idle" as Mark));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Miss queue failed.");
      });
    return () => {
      alive = false;
    };
  }, [retry]);

  async function grade(i: number) {
    const q = items?.[i];
    if (!q || marks[i] === "checking" || marks[i] === "right") return;
    const n = Number(answers[i]);
    if ((answers[i] ?? "").trim() === "" || !Number.isFinite(n)) return;
    setMarks((m) => m.map((v, k) => (k === i ? "checking" : v)));
    try {
      const r = await fetch("/api/paper/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: q.check, tolerance: q.tolerance, answer: n }),
      });
      const d = await readApiJson<{ correct: boolean }>(r, "Grade failed.");
      setMarks((m) => m.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)));
    } catch {
      setMarks((m) => m.map((v, k) => (k === i ? "idle" : v)));
    }
  }

  const cleared = marks.filter((m) => m === "right").length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Second chance"
        title={<>Miss <span className="arena-title">queue</span></>}
        sub="The exact questions you missed, lined up for a rematch. Clear them all."
        right={
          items ? (
            <span className="arena-num shrink-0 text-sm text-zinc-400" aria-label={`${cleared} of ${items.length} cleared`}>
              <span className="font-bold text-emerald-300">{cleared}</span>/{items.length}
            </span>
          ) : undefined
        }
      />
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
          >
            Retry
          </button>
        </div>
      ) : null}
      {!items && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading misses">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {items && items.length === 0 ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Queue empty.</p>
          <p className="text-sm text-zinc-400">No misses on record — fight a boss to fill it.</p>
          <Link href="/arena" className="arena-btn-primary rounded-full px-5 py-2 text-sm font-bold text-white">
            Find a boss
          </Link>
        </div>
      ) : null}
      {items?.map((q, i) => (
        <div key={`${q.boss_id}:${q.question_index}`} className={`arena-card rounded-2xl p-5 ${marks[i] === "right" ? "border-emerald-700" : marks[i] === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
            {q.skill_name} · <span className="font-bold text-amber-300">Lv {q.level}</span>
          </p>
          <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          <p className="mt-1 text-sm text-zinc-400"><span aria-hidden="true">💡</span> Hint: {q.hint}</p>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              step="any"
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void grade(i);
              }}
              placeholder="Your numeric answer"
              aria-label={`Answer for missed question ${i + 1}`}
              disabled={marks[i] === "right"}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void grade(i)}
              disabled={marks[i] === "checking" || marks[i] === "right"}
              aria-label={
                marks[i] === "checking"
                  ? `Checking answer ${i + 1}`
                  : marks[i] === "right"
                    ? `Question ${i + 1} cleared`
                    : marks[i] === "wrong"
                      ? `Question ${i + 1} incorrect, retry`
                      : `Check answer ${i + 1}`
              }
              className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {marks[i] === "checking" ? "…" : marks[i] === "right" ? "Cleared ✓" : marks[i] === "wrong" ? "Retry" : "Check"}
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}

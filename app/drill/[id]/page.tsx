"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import MathText from "@/components/MathText";
import PageHeader from "@/components/ui/PageHeader";
import { skillName } from "@/lib/graph/skills";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type StrippedQ = {
  level: number;
  prompt_latex: string;
  hint: string;
  tolerance: number;
  skill_tag: string;
};

type DrillView = {
  id: string;
  title: string;
  source: string;
  questions: StrippedQ[];
};

type Suggestion = { type: string; label: string; href: string; skill?: string };

type Result = {
  score: number;
  total: number;
  marks: boolean[];
  per_skill: Record<string, { right: number; total: number }>;
  suggestions: Suggestion[];
};

function DrillRunner() {
  const { id } = useParams<{ id: string }>();
  const [drill, setDrill] = useState<DrillView | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setError("");
      setDrill(null);
      setResult(null);
    });
    fetch("/api/drill/" + id)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Drill set failed to load."));
        return readApiJson<DrillView>(r, "Drill set failed to load.");
      })
      .then((d) => {
        if (!alive) return;
        setDrill(d);
        setAnswers(d.questions.map(() => ""));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Drill set failed to load.");
      });
    return () => {
      alive = false;
    };
  }, [id, retry]);

  async function submit() {
    if (!drill || submitting || result) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = answers.map((a) => {
        const t = (a ?? "").trim();
        if (t === "") return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      });
      const r = await fetch(`/api/drill/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Submit failed."));
      setResult(await readApiJson<Result>(r, "Submit failed."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function practiceAgain() {
    if (!drill) return;
    setAnswers(drill.questions.map(() => ""));
    setResult(null);
    setError("");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Drill set"
        title={drill ? drill.title : "…"}
        sub={
          drill
            ? `${drill.questions.length} questions · graded on the server when you submit the whole set.`
            : undefined
        }
        right={
          result ? (
            <span className="arena-num shrink-0 text-sm text-zinc-400" aria-label={`Score ${result.score} of ${result.total}`}>
              <span className="font-bold text-emerald-300">{result.score}</span>/{result.total}
            </span>
          ) : undefined
        }
      />
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">
            {error}
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
              className="arena-btn-primary min-h-[48px] rounded-full px-5 py-2 text-sm font-bold text-white"
            >
              Retry
            </button>
            <Link
              href="/drill"
              className="arena-btn-ghost inline-block min-h-[48px] rounded-full px-5 py-3 text-sm font-medium text-zinc-200"
            >
              Back to hub
            </Link>
          </div>
        </div>
      ) : null}
      {!drill && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading drill set">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Loading your set…</p>
        </div>
      ) : null}
      {result ? (
        <section className="arena-enter arena-card flex flex-col gap-3 rounded-2xl p-5" aria-label="Drill result">
          <p className="text-center text-lg font-extrabold text-zinc-100">
            Score <span className="arena-num text-emerald-300">{result.score}</span>
            <span className="text-zinc-400">/{result.total}</span>
          </p>
          <ul className="space-y-1 text-sm text-zinc-400">
            {Object.entries(result.per_skill).map(([tag, s]) => (
              <li key={tag} className="flex justify-between gap-3">
                <span>{skillName(tag)}</span>
                <span className="arena-num">
                  <span className="font-bold text-emerald-300">{s.right}</span>/{s.total}
                </span>
              </li>
            ))}
          </ul>
          <nav className="flex flex-col gap-2" aria-label="Next steps">
            {result.suggestions.map((s) => (
              <Link
                key={s.type + s.href}
                href={s.href}
                className="arena-btn-ghost min-h-[48px] rounded-full px-5 py-3 text-center text-sm font-bold text-zinc-100"
              >
                {s.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={practiceAgain}
            className="mx-auto w-fit text-sm font-medium text-zinc-400 underline"
          >
            Practice this set again
          </button>
        </section>
      ) : null}
      {drill?.questions.map((q, i) => {
        const mark = result ? result.marks[i] : null;
        return (
          <div
            key={i}
            className={`arena-card rounded-2xl p-5 ${mark === true ? "border-emerald-700" : mark === false ? "border-red-800" : ""}`}
          >
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
              Q{i + 1} · <span className="font-bold text-amber-300">Lv {q.level}</span> · {skillName(q.skill_tag)}
              {mark === true ? <span className="ml-2 text-emerald-300">✓</span> : null}
              {mark === false ? <span className="ml-2 text-red-400">✗</span> : null}
            </p>
            <MathText text={q.prompt_latex} className="mt-1 min-h-[48px] overflow-x-auto text-lg text-zinc-100" />
            <p className="mt-1 text-sm text-zinc-400">
              <span aria-hidden="true">💡</span> Hint: {q.hint}
            </p>
            <input
              type="number"
              step="any"
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))}
              placeholder="Your numeric answer"
              aria-label={`Answer for question ${i + 1}`}
              disabled={result !== null}
              className="arena-input arena-num mt-3 min-h-[48px] w-full rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
          </div>
        );
      })}
      {drill && !result ? (
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="arena-btn-primary min-h-[48px] w-full rounded-full px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {submitting ? "Grading…" : `Submit ${drill.questions.length} answers`}
        </button>
      ) : null}
    </main>
  );
}

// useParams must stream inside Suspense (Next 16 prerender rule).
export default function DrillRunnerPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-center text-sm text-zinc-500">Loading your set…</p>}>
      <DrillRunner />
    </Suspense>
  );
}

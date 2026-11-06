"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { skillName } from "@/lib/graph/skills";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type PQ = {
  level: number;
  prompt_latex: string;
  tolerance: number;
  hint: string;
  check: unknown;
};
type Mark = "idle" | "checking" | "right" | "wrong";

// NOTE (post-judging): 10-question generation can exceed Vercel Hobby's 60s
// function cap. Split into 2x5 parallel calls or move to a queued job then.
function PaperInner() {
  const search = useSearchParams();
  const skill = search.get("skill") ?? "";
  const [questions, setQuestions] = useState<PQ[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError("");
      setQuestions(null);
    });
    fetch("/api/paper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_tag: skill }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Paper forge failed."));
        return readApiJson<{ questions: PQ[] }>(r, "Paper forge failed.");
      })
      .then((d) => {
        if (!alive) return;
        setQuestions(d.questions);
        setAnswers(d.questions.map(() => ""));
        setMarks(d.questions.map(() => "idle" as Mark));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Paper forge failed.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [skill]);

  async function grade(i: number) {
    const q = questions?.[i];
    const n = Number(answers[i]);
    if (!q || !Number.isFinite(n) || marks[i] === "checking") return;
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

  const score = marks.filter((m) => m === "right").length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Practice paper"
        title={<>Drill <span className="arena-title">{skill ? skillName(skill) : "…"}</span></>}
        sub="10 machine-verified questions, 2 per level. Answers are graded on the server — never revealed."
      />
      {loading ? (
        <div className="flex flex-col gap-3" aria-label="Forging paper">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Forging 10 questions, verifying answers…</p>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {questions ? (
        <p className="text-center text-sm text-zinc-400">
          Score <span className="arena-num font-bold text-emerald-300">{score}</span>/{questions.length}
        </p>
      ) : null}
      {questions?.map((q, i) => (
        <div key={i} className={`arena-card rounded-2xl p-5 ${marks[i] === "right" ? "border-emerald-700" : marks[i] === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
            Q{i + 1} · <span className="font-bold text-amber-300">Lv {q.level}</span>
          </p>
          <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          <p className="mt-1 text-sm text-zinc-400">💡 Hint: {q.hint}</p>
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
              aria-label={`Answer for question ${i + 1}`}
              disabled={marks[i] === "right"}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void grade(i)}
              disabled={marks[i] === "checking" || marks[i] === "right"}
              className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {marks[i] === "checking" ? "…" : marks[i] === "right" ? "✓" : marks[i] === "wrong" ? "Retry" : "Check"}
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}

export default function PaperPage() {
  return (
    <Suspense>
      <PaperInner />
    </Suspense>
  );
}

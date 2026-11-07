"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import { skillName } from "@/lib/graph/skills";
import { EXAM_SECONDS, URGENT_MS, examExpired, examRemainingMs, formatExamClock } from "@/lib/paper/exam";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type PQ = {
  level: number;
  prompt_latex: string;
  tolerance: number;
  hint: string;
  check: unknown;
};
type Mark = "idle" | "checking" | "right" | "wrong";

type StoredExam = { questions: PQ[]; answers: string[]; marks: string[]; deadline: number };

const VALID_MARKS = ["idle", "checking", "right", "wrong"];

// NOTE (post-judging): the forge is 2 sequential 5Q sets and can still exceed
// Vercel Hobby's 60s function cap. Parallelize the sets or queue the job then.
function PaperInner() {
  const search = useSearchParams();
  const skill = search.get("skill") ?? "";
  const exam = search.get("exam") === "1";
  const [questions, setQuestions] = useState<PQ[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [gerr, setGerr] = useState<Record<number, string>>({});
  const [started, setStarted] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [retry, setRetry] = useState(0);

  const expired = exam && started && examExpired(deadline, now);
  const locked = expired;
  const view = (m: Mark): Mark => (locked && m !== "right" ? "wrong" : m);
  const remaining = examRemainingMs(deadline, now);
  const urgent = exam && started && !expired && remaining < URGENT_MS;

  useEffect(() => {
    // Stop ticking once expired: no more re-renders every second.
    if (!started || expired) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [started, expired]);

  function startExam() {
    const t0 = Date.now();
    setDeadline(t0 + EXAM_SECONDS * 1000);
    setNow(t0);
    setStarted(true);
  }

  function retryForge() {
    try {
      if (exam && skill) sessionStorage.removeItem(`arena_exam_v1:${skill}`);
    } catch {
      // Private mode: retry still works, just without clearing storage.
    }
    setStarted(false);
    setDeadline(0);
    setRetry((r) => r + 1);
  }

  // Persist exam progress so a reload resumes the same paper and clock
  // instead of forging a fresh one. Marks are display-only here.
  useEffect(() => {
    if (!exam || !skill || !questions) return;
    try {
      sessionStorage.setItem(
        `arena_exam_v1:${skill}`,
        JSON.stringify({ questions, answers, marks, deadline }),
      );
    } catch {
      // Quota/private mode: the exam still works, just not resumable.
    }
  }, [exam, skill, questions, answers, marks, deadline]);

  useEffect(() => {
    let alive = true;
    // A skill change must never swap questions under a running clock.
    if (exam && started) return;
    if (exam && skill) {
      try {
        const raw = sessionStorage.getItem(`arena_exam_v1:${skill}`);
        const d = raw ? (JSON.parse(raw) as StoredExam | null) : null;
        const valid =
          d &&
          Array.isArray(d.questions) &&
          d.questions.length > 0 &&
          typeof d.deadline === "number" &&
          Array.isArray(d.answers) &&
          Array.isArray(d.marks);
        if (valid) {
          // Stored marks are untrusted display state: validate membership and
          // demote orphaned "checking" (its request died with the reload).
          const clean: Mark[] = d.questions.map(
            (_, k) =>
              (VALID_MARKS.includes(d.marks[k]) && d.marks[k] !== "checking"
                ? d.marks[k]
                : "idle") as Mark,
          );
          const wasStarted = d.deadline > 0;
          queueMicrotask(() => {
            if (!alive) return;
            setQuestions(d.questions);
            setAnswers(d.questions.map((_, k) => (typeof d.answers[k] === "string" ? d.answers[k] : "")));
            setMarks(clean);
            setDeadline(d.deadline);
            setStarted(wasStarted);
            setNow(Date.now());
            setLoading(false);
            setError("");
          });
          return;
        }
      } catch {
        // Corrupt entry: fall through to a fresh forge.
      }
    }
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError("");
      setQuestions(null);
      setGerr({});
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
  }, [skill, exam, started, retry]);

  async function grade(i: number) {
    const q = questions?.[i];
    if (!q || marks[i] === "checking" || locked) return;
    // Number("") is 0: blank input must never be graded as zero.
    if ((answers[i] ?? "").trim() === "" || !Number.isFinite(Number(answers[i]))) {
      setGerr((g) => ({ ...g, [i]: "Enter a number." }));
      return;
    }
    const n = Number(answers[i]);
    setGerr((g) => {
      if (!(i in g)) return g;
      const next = { ...g };
      delete next[i];
      return next;
    });
    setMarks((m) => m.map((v, k) => (k === i ? "checking" : v)));
    try {
      const r = await fetch("/api/paper/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: q.check, tolerance: q.tolerance, answer: n }),
      });
      const d = await readApiJson<{ correct: boolean }>(r, "Grade failed.");
      // A grade launched before expiry must not rewrite the final score.
      // Uses the ticking clock (same staleness budget as `locked`).
      if (exam && started && examExpired(deadline, now)) return;
      setMarks((m) => m.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)));
    } catch {
      setMarks((m) => m.map((v, k) => (k === i ? "idle" : v)));
      setGerr((g) => ({ ...g, [i]: "Grading failed — retry." }));
    }
  }

  const score = marks.filter((m) => view(m) === "right").length;
  const shown = questions && (!exam || started);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker={exam ? "Timed exam" : "Practice paper"}
        title={<>Drill <span className="arena-title">{skill ? skillName(skill) : "…"}</span></>}
        sub={
          exam
            ? "10 machine-verified questions, 15 minutes. When time runs out the paper locks."
            : "10 machine-verified questions, 2 per level. Answers are graded on the server — never revealed."
        }
        right={
          exam && started ? (
            <span role="timer" aria-label="Exam time left" className={`shrink-0 font-mono text-sm tabular-nums ${expired ? "font-bold text-red-400" : urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
              {expired ? "00:00" : formatExamClock(remaining)}
            </span>
          ) : undefined
        }
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Forging paper">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Forging 10 questions, verifying answers…</p>
        </div>
      ) : null}
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">
            {error}
          </p>
          <button
            type="button"
            onClick={retryForge}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
          >
            Retry forge
          </button>
        </div>
      ) : null}
      {!exam && questions ? (
        <Link
          href={`/paper?skill=${encodeURIComponent(skill)}&exam=1`}
          className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
        >
          Take as a 15-minute timed exam
        </Link>
      ) : null}
      {exam && questions && !started ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Paper forged. Clock ready.</p>
          <p className="text-sm text-zinc-400">10 questions, 15 minutes. The timer starts when you begin.</p>
          <button
            type="button"
            onClick={startExam}
            className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white"
          >
            Start exam
          </button>
        </div>
      ) : null}
      {expired ? (
        <div role="status" className="arena-enter rounded-2xl bg-red-950/40 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-red-300 uppercase">Time&apos;s up</p>
          <p className="mt-1 text-sm text-zinc-300">
            Final score <span className="arena-num font-bold text-emerald-300">{score}</span>/{questions?.length ?? 10} — the paper is locked.
          </p>
        </div>
      ) : null}
      {shown ? (
        <p className="text-center text-sm text-zinc-400">
          Score <span className="arena-num font-bold text-emerald-300">{score}</span>/{questions?.length ?? 0}
        </p>
      ) : null}
      {(shown ? questions : null)?.map((q, i) => (
        <div key={i} className={`arena-card rounded-2xl p-5 ${view(marks[i]) === "right" ? "border-emerald-700" : view(marks[i]) === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">
            Q{i + 1} · <span className="font-bold text-amber-300">Lv {q.level}</span>
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
              aria-label={`Answer for question ${i + 1}`}
              disabled={locked || marks[i] === "right"}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void grade(i)}
              disabled={locked || marks[i] === "checking" || marks[i] === "right"}
              aria-label={
                marks[i] === "checking"
                  ? `Checking answer ${i + 1}`
                  : view(marks[i]) === "right"
                    ? `Question ${i + 1} correct`
                    : view(marks[i]) === "wrong"
                      ? locked
                        ? `Question ${i + 1} incorrect, paper locked`
                        : `Question ${i + 1} incorrect, retry`
                      : `Check answer ${i + 1}`
              }
              className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {marks[i] === "checking" ? "…" : view(marks[i]) === "right" ? "✓" : view(marks[i]) === "wrong" ? (locked ? "✗" : "Retry") : "Check"}
            </button>
          </div>
          {gerr[i] ? (
            <p role="alert" className="text-sm text-red-400">
              {gerr[i]}
            </p>
          ) : null}
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

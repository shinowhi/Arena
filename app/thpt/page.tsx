"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import StickyTimer from "@/components/education/StickyTimer";
import { examExpired, examRemainingMs, formatExamClock, URGENT_MS } from "@/lib/paper/exam";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type TQ = {
  skill_tag: string;
  skill_name: string;
  level: number;
  prompt_latex: string;
  hint: string;
  tolerance: number;
  check: unknown;
};
type Mark = "idle" | "checking" | "right" | "wrong";

const THPT_SECONDS = 5400;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function ThptInner() {
  const search = useSearchParams();
  const day = search.get("day") ?? "";
  const [date, setDate] = useState("");
  const [questions, setQuestions] = useState<TQ[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [retry, setRetry] = useState(0);

  const storeKey = date ? `arena_thpt_v1:${date}` : "";
  const expired = started && examExpired(deadline, now);
  const locked = expired;
  const view = (m: Mark): Mark => (locked && m !== "right" ? "wrong" : m);
  const remaining = examRemainingMs(deadline, now);
  const urgent = started && !expired && remaining < URGENT_MS * 5;

  useEffect(() => {
    if (!started || expired) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [started, expired]);

  function startExam() {
    const t0 = Date.now();
    setDeadline(t0 + THPT_SECONDS * 1000);
    setNow(t0);
    setStarted(true);
  }

  // Persist progress so a reload resumes the same paper and clock.
  useEffect(() => {
    if (!storeKey || !questions) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ questions, answers, marks, deadline }));
    } catch {
      // Quota/private mode: the exam still works, just not resumable.
    }
  }, [storeKey, questions, answers, marks, deadline]);

  useEffect(() => {
    let alive = true;
    if (started) return;
    const wantDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayStr();
    if (wantDay) {
      try {
        const raw = sessionStorage.getItem(`arena_thpt_v1:${wantDay}`);
        const d = raw ? (JSON.parse(raw) as { questions: TQ[]; answers: string[]; marks: Mark[]; deadline: number } | null) : null;
        if (d && Array.isArray(d.questions) && d.questions.length > 0 && typeof d.deadline === "number") {
          queueMicrotask(() => {
            if (!alive) return;
            setDate(wantDay);
            setQuestions(d.questions);
            setAnswers(d.questions.map((_, k) => (typeof d.answers[k] === "string" ? d.answers[k] : "")));
            setMarks(d.questions.map((_, k) => (d.marks[k] === "right" || d.marks[k] === "wrong" ? d.marks[k] : "idle")));
            setDeadline(d.deadline);
            setStarted(d.deadline > 0);
            setNow(Date.now());
            setLoading(false);
            setError("");
          });
          return;
        }
      } catch {
        // Corrupt entry: fall through to a fresh mock.
      }
    }
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError("");
      setQuestions(null);
    });
    fetch(`/api/thpt/mock?day=${wantDay}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Mock failed."));
        return readApiJson<{ date: string; questions: TQ[] }>(r, "Mock failed.");
      })
      .then((d) => {
        if (!alive) return;
        setDate(d.date);
        setQuestions(d.questions);
        setAnswers(d.questions.map(() => ""));
        setMarks(d.questions.map(() => "idle" as Mark));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Mock failed.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [day, started, retry]);

  async function grade(i: number) {
    const q = questions?.[i];
    if (!q || marks[i] === "checking" || locked) return;
    if ((answers[i] ?? "").trim() === "" || !Number.isFinite(Number(answers[i]))) return;
    const n = Number(answers[i]);
    setMarks((m) => m.map((v, k) => (k === i ? "checking" : v)));
    try {
      const r = await fetch("/api/paper/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: q.check, tolerance: q.tolerance, answer: n }),
      });
      const d = await readApiJson<{ correct: boolean }>(r, "Grade failed.");
      if (started && examExpired(deadline, now)) return;
      setMarks((m) => m.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)));
    } catch {
      setMarks((m) => m.map((v, k) => (k === i ? "idle" : v)));
    }
  }

  const score = marks.filter((m) => view(m) === "right").length;
  const shown = questions && started;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-x-clip px-4 py-8">
      <PageHeader
        kicker="THPTQG mock"
        title={<>Exam <span className="arena-title">{date || "…"}</span></>}
        sub="50 questions, 90 minutes, machine-graded. Same paper all day — retake it tomorrow for a fresh one. Practice only: this format differs from the official THPT paper and the score is not equivalent."
        right={
          started ? (
            <span role="timer" aria-label="Exam time left" className={`shrink-0 font-mono text-sm tabular-nums ${expired ? "font-bold text-red-400" : urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
              {expired ? "00:00" : formatExamClock(remaining)}
            </span>
          ) : undefined
        }
      />
      <StickyTimer
        show={started}
        label="Exam time left"
        text={expired ? "00:00" : formatExamClock(remaining)}
        tone={expired ? "expired" : urgent ? "urgent" : "normal"}
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading mock">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setStarted(false);
              setDeadline(0);
              setRetry((r) => r + 1);
            }}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
          >
            Retry
          </button>
        </div>
      ) : null}
      {questions && !started ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Paper ready. Clock ready.</p>
          <p className="text-sm text-zinc-400">50 questions, 90 minutes. The timer starts when you begin.</p>
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
            Final <span className="arena-num font-bold text-emerald-300">{score}/{questions?.length ?? 50} correct</span>
            — the paper is locked.
          </p>
        </div>
      ) : null}
      {shown ? (
        <p className="text-center text-sm text-zinc-400">
          Score <span className="arena-num font-bold text-emerald-300">{score}</span>/{questions?.length ?? 0} correct
          
        </p>
      ) : null}
      {(shown ? questions : null)?.map((q, i) => (
        <div key={i} className={`arena-card rounded-2xl p-5 ${view(marks[i]) === "right" ? "border-emerald-700" : view(marks[i]) === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs text-zinc-500">
            Q{i + 1} · {q.skill_name} · <span className="font-bold text-amber-300">Lv {q.level}</span>
          </p>
          <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
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
              aria-label={`Check answer ${i + 1}`}
              className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {marks[i] === "checking" ? "…" : view(marks[i]) === "right" ? "✓" : view(marks[i]) === "wrong" ? (locked ? "✗" : "Retry") : "Check"}
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}

export default function ThptPage() {
  return (
    <Suspense>
      <ThptInner />
    </Suspense>
  );
}

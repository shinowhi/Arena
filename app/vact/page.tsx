"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import StickyTimer from "@/components/education/StickyTimer";
import { examExpired, examRemainingMs, formatExamClock, URGENT_MS } from "@/lib/paper/exam";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type VQ = {
  no: number;
  prompt_latex: string;
  options: string[];
  tier: "verified" | "draft";
};
type VSection = {
  id: string;
  name: string;
  as_of: string;
  questions: VQ[];
};
type Mark = "idle" | "checking" | "right" | "wrong";

const VACT_SECONDS = 150 * 60;
const LETTERS = ["A", "B", "C", "D"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function VactInner() {
  const search = useSearchParams();
  const day = search.get("day") ?? "";
  const [date, setDate] = useState("");
  const [sections, setSections] = useState<VSection[] | null>(null);
  const [tab, setTab] = useState(0);
  const [picked, setPicked] = useState<number[][]>([]);
  const [marks, setMarks] = useState<Mark[][]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [retry, setRetry] = useState(0);

  const storeKey = date ? `arena_vact_v1:${date}` : "";
  const expired = started && examExpired(deadline, now);
  const locked = expired;
  const remaining = examRemainingMs(deadline, now);
  const urgent = started && !expired && remaining < URGENT_MS * 10;

  useEffect(() => {
    if (!started || expired) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [started, expired]);

  function startExam() {
    const t0 = Date.now();
    setDeadline(t0 + VACT_SECONDS * 1000);
    setNow(t0);
    setStarted(true);
  }

  useEffect(() => {
    if (!storeKey || !sections) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ sections, picked, marks, deadline }));
    } catch {
      // Quota/private mode: the exam still works, just not resumable.
    }
  }, [storeKey, sections, picked, marks, deadline]);

  useEffect(() => {
    let alive = true;
    if (started) return;
    const wantDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayStr();
    try {
      const raw = sessionStorage.getItem(`arena_vact_v1:${wantDay}`);
      const d = raw
        ? (JSON.parse(raw) as { sections: VSection[]; picked: number[][]; marks: Mark[][]; deadline: number } | null)
        : null;
      if (d && Array.isArray(d.sections) && d.sections.length > 0 && typeof d.deadline === "number") {
        queueMicrotask(() => {
          if (!alive) return;
          setDate(wantDay);
          setSections(d.sections);
          setPicked(d.sections.map((s, a) => s.questions.map((_, k) => (typeof d.picked[a]?.[k] === "number" ? d.picked[a][k] : -1))));
          setMarks(d.sections.map((s, a) => s.questions.map((_, k) => (d.marks[a]?.[k] === "right" || d.marks[a]?.[k] === "wrong" ? d.marks[a][k] : "idle"))));
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
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError("");
      setSections(null);
    });
    fetch(`/api/vact/mock?day=${wantDay}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Mock failed."));
        return readApiJson<{ date: string; sections: VSection[] }>(r, "Mock failed.");
      })
      .then((d) => {
        if (!alive) return;
        setDate(d.date);
        setSections(d.sections);
        setPicked(d.sections.map((s) => s.questions.map(() => -1)));
        setMarks(d.sections.map((s) => s.questions.map(() => "idle" as Mark)));
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

  async function grade(a: number, i: number) {
    const s = sections?.[a];
    if (!s || picked[a]?.[i] === undefined || picked[a][i] < 0 || marks[a]?.[i] === "checking" || locked) return;
    setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? "checking" : v)) : row)));
    try {
      const r = await fetch("/api/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: s.id, index: i, selected: picked[a][i], as_of: s.as_of }),
      });
      if (r.status === 409) throw new Error("Paper refreshed — reload for the new paper.");
      const d = await readApiJson<{ correct: boolean }>(r, "Grade failed.");
      if (started && examExpired(deadline, now)) return;
      setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)) : row)));
    } catch {
      setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? "idle" : v)) : row)));
    }
  }

  const score = marks.flat().filter((m) => (locked && m !== "right" ? "wrong" : m) === "right").length;
  const total = sections?.reduce((t, s) => t + s.questions.length, 0) ?? 120;
  const cur = sections?.[tab] ?? null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-x-clip px-4 py-8">
      <PageHeader
        kicker="V-ACT mock"
        title={<>Exam <span className="arena-title">{date || "…"}</span></>}
        sub="120 questions, 150 minutes, machine-graded. Same paper for 2 days — retake it after refresh for a fresh one."
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
          <p role="alert" className="text-sm text-zinc-300">{error}</p>
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
      {sections && !started ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="font-display text-xl font-extrabold text-zinc-100">Paper ready. Clock ready.</p>
          <p className="text-sm text-zinc-400">120 questions, 150 minutes. The timer starts when you begin.</p>
          <button type="button" onClick={startExam} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white">
            Start exam
          </button>
        </div>
      ) : null}
      {expired ? (
        <div role="status" className="arena-enter rounded-2xl bg-red-950/40 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-red-300 uppercase">Time&apos;s up</p>
          <p className="mt-1 text-sm text-zinc-300">
            Final <span className="arena-num font-bold text-emerald-300">{score}/{total}</span>
            {" "}(<span className="arena-num font-bold text-emerald-300">{score * 10}</span>/1200) — the paper is locked.
          </p>
          <Link href={`/exam/review?exam=vact&day=${date}`} className="arena-btn-ghost mt-3 inline-block rounded-full px-5 py-2 text-sm font-bold text-zinc-200">
            Review answers
          </Link>
        </div>
      ) : null}
      {sections && started ? (
        <>
          <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Sections">
            {sections.map((s, a) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={tab === a}
                onClick={() => setTab(a)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === a ? "arena-btn-primary text-white" : "arena-btn-ghost text-zinc-300"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="text-center text-sm text-zinc-400">
            Score <span className="arena-num font-bold text-emerald-300">{score}</span>/{total}
            {" "}(<span className="arena-num font-bold text-emerald-300">{score * 10}</span>/1200)
          </p>
        </>
      ) : null}
      {cur && started
        ? cur.questions.map((q, i) => {
            const m = marks[tab]?.[i] ?? "idle";
            const view: Mark = locked && m !== "right" ? "wrong" : m;
            return (
              <div key={q.no} className={`arena-card rounded-2xl p-5 ${view === "right" ? "border-emerald-700" : view === "wrong" ? "border-red-800" : ""}`}>
                <p className="text-xs text-zinc-500">
                  Q{q.no} · {cur.name} ·{" "}
                  {q.tier === "verified" ? (
                    <span className="font-bold text-emerald-300">Verified</span>
                  ) : (
                    <span className="font-bold text-amber-300">AI draft</span>
                  )}
                </p>
                <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
                <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={`Options for question ${q.no}`}>
                  {q.options.map((o, k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={picked[tab]?.[i] === k}
                      disabled={locked || m === "right"}
                      onClick={() => setPicked((p) => p.map((row, ra) => (ra === tab ? row.map((v, kk) => (kk === i ? k : v)) : row)))}
                      className={`flex items-center gap-3 rounded-xl px-4 py-2 text-left text-zinc-100 disabled:opacity-60 ${picked[tab]?.[i] === k ? "arena-btn-primary" : "arena-btn-ghost"}`}
                    >
                      <span className="arena-num font-bold">{LETTERS[k]}</span>
                      <MathText text={o} className="min-w-0 flex-1" />
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Link
                    href={`/tutor?ctx=exam&section=${encodeURIComponent(cur.id)}&index=${i}&as_of=${encodeURIComponent(cur.as_of)}`}
                    aria-label={`Ask the tutor about question ${q.no}`}
                    className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-bold text-zinc-200"
                  >
                    Ask tutor
                  </Link>
                  <button
                    type="button"
                    onClick={() => void grade(tab, i)}
                    disabled={locked || m === "checking" || m === "right" || (picked[tab]?.[i] ?? -1) < 0}
                    aria-label={`Check answer ${q.no}`}
                    className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {m === "checking" ? "…" : view === "right" ? "✓" : view === "wrong" ? (locked ? "✗" : "Retry") : "Check"}
                  </button>
                </div>
              </div>
            );
          })
        : null}
    </main>
  );
}

export default function VactPage() {
  return (
    <Suspense>
      <VactInner />
    </Suspense>
  );
}

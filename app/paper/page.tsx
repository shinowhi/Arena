"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStatus } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import { BulbIcon, CheckIcon, XIcon } from "@/components/ui/icons";
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
  // Throttled: per-keystroke answers would otherwise rewrite the full paper
  // on every keypress. Writes at most once per second, immediately when the
  // paper locks, and flushes trailing state on unmount.
  const persistRef = useRef<{ key: string; payload: { questions: PQ[]; answers: string[]; marks: Mark[]; deadline: number } } | null>(null);
  const lastPersistRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!exam || !skill || !questions) return;
    persistRef.current = {
      key: `arena_exam_v1:${skill}`,
      payload: { questions, answers, marks, deadline },
    };
    const write = () => {
      const pending = persistRef.current;
      if (!pending) return;
      persistRef.current = null;
      lastPersistRef.current = Date.now();
      try {
        sessionStorage.setItem(pending.key, JSON.stringify(pending.payload));
      } catch {
        // Quota/private mode: the exam still works, just not resumable.
      }
    };
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = null;
    if (locked) {
      write();
      return;
    }
    if (Date.now() - lastPersistRef.current >= 1000) {
      write();
      return;
    }
    persistTimerRef.current = setTimeout(write, 1000);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    };
  }, [exam, skill, questions, answers, marks, deadline, locked]);
  // Flush trailing throttled state on unmount (navigation away mid-paper).
  useEffect(() => {
    return () => {
      const pending = persistRef.current;
      if (!pending) return;
      persistRef.current = null;
      try {
        sessionStorage.setItem(pending.key, JSON.stringify(pending.payload));
      } catch {
        // Quota/private mode: nothing to resume.
      }
    };
  }, []);
  // Same flush on pagehide (reload/tab-close): React unmount cleanups do NOT
  // run there, and a reload inside the ~1s throttle window would otherwise
  // lose trailing answers — the exact resume case this persist exists for.
  useEffect(() => {
    const flush = () => {
      const pending = persistRef.current;
      if (!pending) return;
      persistRef.current = null;
      try {
        sessionStorage.setItem(pending.key, JSON.stringify(pending.payload));
      } catch {
        // Quota/private mode: nothing to resume.
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

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
        if (!r.ok) throw new Error(await readApiError(r, "Không soạn được đề."));
        return readApiJson<{ questions: PQ[] }>(r, "Không soạn được đề.");
      })
      .then((d) => {
        if (!alive) return;
        setQuestions(d.questions);
        setAnswers(d.questions.map(() => ""));
        setMarks(d.questions.map(() => "idle" as Mark));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Không soạn được đề.");
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
      setGerr((g) => ({ ...g, [i]: "Nhập một số nhé." }));
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
      const d = await readApiJson<{ correct: boolean }>(r, "Chấm thất bại.");
      // A grade launched before expiry must not rewrite the final score.
      // Uses the ticking clock (same staleness budget as `locked`).
      if (exam && started && examExpired(deadline, now)) return;
      setMarks((m) => m.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)));
    } catch {
      setMarks((m) => m.map((v, k) => (k === i ? "idle" : v)));
      setGerr((g) => ({ ...g, [i]: "Chấm thất bại — thử lại nhé." }));
    }
  }

  const score = marks.filter((m) => view(m) === "right").length;
  const shown = questions && (!exam || started);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStatus label={exam ? (locked ? "Đã khóa bài" : started ? "Đang thi" : "Sẵn sàng") : "Đề luyện"}>
        {exam && started ? (expired ? "Hết giờ" : formatExamClock(remaining)) : `10 câu — đúng ${score} câu`}
      </HeroStatus>
      <PageHeader
        kicker={exam ? "Thi bấm giờ" : "Đề luyện"}
        title={<>Luyện <span className="arena-title">{skill ? skillName(skill) : "…"}</span></>}
        sub={
          exam
            ? "10 câu đã kiểm chứng bằng máy, 15 phút. Hết giờ là đề khóa lại."
            : "10 câu đã kiểm chứng bằng máy, mỗi cấp 2 câu. Đáp án chấm trên máy chủ — không bao giờ lộ."
        }
        right={
          exam && started ? (
            <span role="timer" aria-label="Thời gian còn lại" className={`shrink-0 font-mono text-sm tabular-nums ${expired ? "font-bold text-red-400" : urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
              {expired ? "00:00" : formatExamClock(remaining)}
            </span>
          ) : undefined
        }
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang soạn đề">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Đang soạn 10 câu, kiểm chứng đáp án…</p>
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
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
          >
            Soạn đề khác
          </button>
        </div>
      ) : null}
      {!exam && questions ? (
        <Link
          href={`/paper?skill=${encodeURIComponent(skill)}&exam=1`}
          className="arena-btn-ghost mx-auto w-fit rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
        >
          Thi bấm giờ 15 phút với đề này
        </Link>
      ) : null}
      {exam && questions && !started ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-zinc-100">Đề đã sẵn sàng, đồng hồ cũng vậy.</h2>
          <p className="text-sm text-zinc-400">10 câu, 15 phút. Bấm giờ bắt đầu khi bạn vào thi.</p>
          <button
            type="button"
            onClick={startExam}
            className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white"
          >
            Vào phòng thi
          </button>
        </div>
      ) : null}
      {expired ? (
        <div role="status" className="arena-enter rounded-2xl bg-red-950/40 p-4 text-center">
          <p className="text-xs font-bold text-red-300">Hết giờ</p>
          <p className="mt-1 text-sm text-zinc-300 tabular-nums">
            Điểm cuối <span className="arena-num font-bold text-emerald-300">{score}</span>/{questions?.length ?? 10} — đề đã khóa.
          </p>
        </div>
      ) : null}
      {shown ? (
        <p className="text-center text-sm text-zinc-400 tabular-nums">
          Điểm <span className="arena-num font-bold text-emerald-300">{score}</span>/{questions?.length ?? 0}
        </p>
      ) : null}
      {(shown ? questions : null)?.map((q, i) => (
        <div key={i} className={`arena-card rounded-2xl p-5 ${view(marks[i]) === "right" ? "border-emerald-700" : view(marks[i]) === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs font-bold text-zinc-500">
            Câu {i + 1} — <span className="font-bold text-amber-300">Cấp {q.level}</span>
          </p>
          <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400"><BulbIcon className="h-4 w-4 text-amber-300" /> Gợi ý: {q.hint}</p>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              step="any"
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void grade(i);
              }}
              placeholder="Đáp số của bạn"
              aria-label={`Đáp số câu ${i + 1}`}
              disabled={locked || marks[i] === "right"}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void grade(i)}
              disabled={locked || marks[i] === "checking" || marks[i] === "right"}
              aria-label={
                marks[i] === "checking"
                  ? `Đang chấm câu ${i + 1}`
                  : view(marks[i]) === "right"
                    ? `Câu ${i + 1} đúng`
                    : view(marks[i]) === "wrong"
                      ? locked
                        ? `Câu ${i + 1} sai, đề đã khóa`
                        : `Câu ${i + 1} sai, thử lại`
                      : `Chấm câu ${i + 1}`
              }
              className="arena-btn-primary inline-flex shrink-0 items-center gap-1 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {marks[i] === "checking" ? "Đang chấm…" : view(marks[i]) === "right" ? <><CheckIcon className="h-4 w-4" label="Đúng" /> Đúng</> : view(marks[i]) === "wrong" ? (locked ? <XIcon className="h-4 w-4" label="Sai" /> : "Thử lại") : "Chấm"}
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

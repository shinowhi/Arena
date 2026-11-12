"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
import StickyTimer from "@/components/education/StickyTimer";
import { examExpired, examRemainingMs, formatExamClock, URGENT_MS } from "@/lib/paper/exam";
import { starCount, starLabel } from "@/lib/paper/stars";
import { track } from "@/lib/tracking/events";
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
type Mode = "practice" | "exam";

type Stored = {
  questions: TQ[];
  answers: string[];
  marks: Mark[];
  attempts: number[];
  unknown: boolean[];
  deadline: number;
  mode: Mode | null;
  submitted: boolean;
  started: boolean;
};

const THPT_SECONDS = 5400;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function starsKey(day: string): string {
  return `arena_thpt_stars_v1:${day}`;
}

function ThptInner() {
  const search = useSearchParams();
  const day = search.get("day") ?? "";
  const [date, setDate] = useState("");
  const [questions, setQuestions] = useState<TQ[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [attempts, setAttempts] = useState<number[]>([]);
  const [unknown, setUnknown] = useState<boolean[]>([]);
  const [hintOpen, setHintOpen] = useState<boolean[]>([]);
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [retry, setRetry] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [grading, setGrading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [finished, setFinished] = useState(false);
  const [best, setBest] = useState(0);
  const autoRef = useRef(false);

  const storeKey = date ? `arena_thpt_v2:${date}` : "";
  const expired = started && mode === "exam" && examExpired(deadline, now);
  const locked = expired || submitted;
  const view = (m: Mark): Mark => (locked && m !== "right" ? "wrong" : m);
  const remaining = examRemainingMs(deadline, now);
  const urgent = started && mode === "exam" && !expired && remaining < URGENT_MS * 5;

  useEffect(() => {
    if (!started || mode !== "exam" || expired) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [started, mode, expired]);

  // Best practice stars for today. Effect-only so prerender stays safe.
  useEffect(() => {
    if (!date) return;
    try {
      const n = Number(window.localStorage.getItem(starsKey(date)) ?? 0);
      // queueMicrotask: repo rule — no sync setState in effects (lint).
      if (Number.isFinite(n) && n > 0) queueMicrotask(() => setBest(Math.min(3, Math.floor(n))));
    } catch {
      // Private mode: no best-stars memory.
    }
  }, [date]);

  // Persist progress so a reload resumes the same paper, mode, and clock.
  useEffect(() => {
    if (!storeKey || !questions) return;
    try {
      const payload: Stored = { questions, answers, marks, attempts, unknown, deadline, mode, submitted, started };
      sessionStorage.setItem(storeKey, JSON.stringify(payload));
    } catch {
      // Quota/private mode: the exam still works, just not resumable.
    }
  }, [storeKey, questions, answers, marks, attempts, unknown, deadline, mode, submitted, started]);

  useEffect(() => {
    let alive = true;
    if (started) return;
    const wantDay = /^\\d{4}-\\d{2}-\\d{2}$/.test(day) ? day : todayStr();
    if (wantDay) {
      try {
        const raw = sessionStorage.getItem(`arena_thpt_v2:${wantDay}`);
        const d = raw ? (JSON.parse(raw) as Stored | null) : null;
        if (d && Array.isArray(d.questions) && d.questions.length > 0) {
          queueMicrotask(() => {
            if (!alive) return;
            setDate(wantDay);
            setQuestions(d.questions);
            setAnswers(d.questions.map((_, k) => (typeof d.answers?.[k] === "string" ? d.answers[k] : "")));
            setMarks(d.questions.map((_, k) => (d.marks?.[k] === "right" || d.marks?.[k] === "wrong" ? d.marks[k] : "idle")));
            setAttempts(d.questions.map((_, k) => (typeof d.attempts?.[k] === "number" ? d.attempts[k] : 0)));
            setUnknown(d.questions.map((_, k) => d.unknown?.[k] === true));
            setHintOpen(d.questions.map(() => false));
            setDeadline(typeof d.deadline === "number" ? d.deadline : 0);
            setMode(d.mode === "practice" || d.mode === "exam" ? d.mode : null);
            setSubmitted(d.submitted === true);
            setStarted(d.started === true);
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
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được đề."));
        return readApiJson<{ date: string; questions: TQ[] }>(r, "Không tải được đề.");
      })
      .then((d) => {
        if (!alive) return;
        setDate(d.date);
        setQuestions(d.questions);
        setAnswers(d.questions.map(() => ""));
        setMarks(d.questions.map(() => "idle" as Mark));
        setAttempts(d.questions.map(() => 0));
        setUnknown(d.questions.map(() => false));
        setHintOpen(d.questions.map(() => false));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được đề.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [day, started, retry]);

  async function checkOne(q: TQ, n: number): Promise<boolean> {
    const r = await fetch("/api/paper/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check: q.check, tolerance: q.tolerance, answer: n }),
    });
    const d = await readApiJson<{ correct: boolean }>(r, "Chấm thất bại.");
    return d.correct === true;
  }

  async function grade(i: number) {
    const q = questions?.[i];
    if (!q || marks[i] === "checking" || expired || submitted) return;
    if ((answers[i] ?? "").trim() === "" || !Number.isFinite(Number(answers[i]))) return;
    const n = Number(answers[i]);
    setAttempts((a) => a.map((v, k) => (k === i ? v + 1 : v)));
    setMarks((m) => m.map((v, k) => (k === i ? "checking" : v)));
    try {
      const ok = await checkOne(q, n);
      if (started && mode === "exam" && examExpired(deadline, Date.now())) return;
      setMarks((m) => m.map((v, k) => (k === i ? (ok ? "right" : "wrong") : v)));
    } catch {
      setMarks((m) => m.map((v, k) => (k === i ? "idle" : v)));
    }
  }

  function startPaper(m: Mode) {
    const t0 = Date.now();
    setMode(m);
    setDeadline(m === "exam" ? t0 + THPT_SECONDS * 1000 : 0);
    setNow(t0);
    setStarted(true);
    track("thpt_started", { mode: m });
  }

  // Grades every answered question in order. Sequential on purpose: kind to
  // the rate limiter and gives a truthful progress counter.
  async function gradeAll(): Promise<number> {
    if (!questions || submitted || grading) return 0;
    setGrading(true);
    const todo = questions.map((_, i) => i).filter((i) => (answers[i] ?? "").trim() !== "" && Number.isFinite(Number(answers[i])));
    setProgress({ done: 0, total: todo.length });
    let right = 0;
    for (const i of todo) {
      const q = questions[i];
      try {
        const ok = await checkOne(q, Number(answers[i]));
        if (ok) right += 1;
        setMarks((m) => m.map((v, k) => (k === i ? (ok ? "right" : "wrong") : v)));
        setAttempts((a) => a.map((v, k) => (k === i ? v + 1 : v)));
      } catch {
        // One bad grade must not block the rest.
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setGrading(false);
    return right;
  }

  async function submitExam() {
    if (!questions || submitted || grading) return;
    if (!window.confirm("Nộp bài? Sau khi nộp sẽ không sửa được nữa.")) return;
    const right = await gradeAll();
    setSubmitted(true);
    track("thpt_finished", { mode: "exam", score: right, total: questions.length });
  }

  // Time-up in exam mode auto-submits once (no confirm: the clock decided).
  // gradeAll intentionally omitted from deps: the guards make it run-once and
  // listing it would re-trigger on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!expired || mode !== "exam" || submitted || grading || autoRef.current || !questions) return;
    autoRef.current = true;
    void gradeAll().then((right) => {
      setSubmitted(true);
      track("thpt_finished", { mode: "exam", score: right, total: questions?.length ?? 0 });
    });
  }, [expired, mode, submitted, grading, questions]);

  const score = marks.filter((m) => view(m) === "right").length;
  const firstTry = (questions ?? []).filter((_, i) => attempts[i] === 1 && marks[i] === "right").length;
  const total = questions?.length ?? 0;
  const stars = starCount(firstTry, total);
  const unknownQs = (questions ?? []).map((_, i) => i + 1).filter((_, i) => unknown[i] === true);
  const shown = questions && started;

  function finishPractice() {
    if (!questions) return;
    setFinished(true);
    try {
      const k = starsKey(date);
      const prev = Number(window.localStorage.getItem(k) ?? 0);
      const next = Number.isFinite(prev) ? Math.max(prev, stars) : stars;
      window.localStorage.setItem(k, String(next));
      setBest(Math.min(3, next));
    } catch {
      // Private mode: stars for this session only.
    }
    track("thpt_finished", { mode: "practice", score, first_try: firstTry, stars });
  }

  function toggleUnknown(i: number) {
    if (locked) return;
    setUnknown((u) => u.map((v, k) => (k === i ? !v : v)));
  }

  function toggleHint(i: number) {
    setHintOpen((h) => h.map((v, k) => (k === i ? !v : v)));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-x-clip px-4 py-8">
      <PageHeader
        kicker="Đề thi THPT"
        title={<>Luyện thi <span className="arena-title">{date || "…"}</span></>}
        sub="50 câu Toán điền số, máy chấm. Mỗi ngày 1 đề — mai có đề mới. Chỉ để luyện tập: khác đề chính thức, điểm không tương đương."
        right={
          started && mode === "exam" ? (
            <span role="timer" aria-label="Thời gian còn lại" className={`shrink-0 font-mono text-sm tabular-nums ${expired ? "font-bold text-red-400" : urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
              {expired ? "00:00" : formatExamClock(remaining)}
            </span>
          ) : undefined
        }
      />
      <StickyTimer
        show={started && mode === "exam"}
        label="Thời gian còn lại"
        text={expired ? "00:00" : formatExamClock(remaining)}
        tone={expired ? "expired" : urgent ? "urgent" : "normal"}
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải đề">
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
              setMode(null);
              setDeadline(0);
              setSubmitted(false);
              autoRef.current = false;
              setRetry((r) => r + 1);
            }}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {questions && !started ? (
        <div className="flex flex-col gap-3">
          {best > 0 ? (
            <p className="text-center text-sm text-amber-300" role="status">
              Hôm nay đã đạt {starLabel(best)} — luyện tiếp để lên 3 sao
            </p>
          ) : null}
          <div className="arena-card flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
            <p className="font-display text-xl font-extrabold text-zinc-100">Luyện tập</p>
            <p className="text-sm text-zinc-400">Không bấm giờ · có gợi ý từng câu · chấm ngay · ăn sao theo số câu đúng ngay lần đầu</p>
            <button
              type="button"
              onClick={() => startPaper("practice")}
              className="arena-btn-primary mt-2 rounded-full px-6 py-2.5 font-bold text-white"
            >
              Bắt đầu luyện
            </button>
          </div>
          <div className="arena-card flex flex-col items-center gap-2 rounded-2xl p-6 text-center">
            <p className="font-display text-xl font-extrabold text-zinc-100">Thi thử</p>
            <p className="text-sm text-zinc-400">50 câu · 90 phút · không gợi ý · nộp bài mới biết điểm</p>
            <button
              type="button"
              onClick={() => startPaper("exam")}
              className="arena-btn-ghost mt-2 rounded-full px-6 py-2.5 font-bold text-zinc-100"
            >
              Vào phòng thi
            </button>
          </div>
        </div>
      ) : null}
      {started && mode === "exam" && locked ? (
        <div role="status" className="arena-enter rounded-2xl bg-red-950/40 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-red-300 uppercase">{submitted ? "Đã nộp bài" : "Hết giờ"}</p>
          <p className="mt-1 text-sm text-zinc-300">
            Đúng <span className="arena-num font-bold text-emerald-300">{score}/{total}</span>
            {" — "}đề đã khóa.
          </p>
          {unknownQs.length > 0 ? (
            <p className="mt-1 text-xs text-amber-300">Đã đánh dấu chưa chắc: câu {unknownQs.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
      {started && mode === "practice" && finished ? (
        <div role="status" className="arena-enter arena-card rounded-2xl p-6 text-center">
          <p className="text-xs font-bold tracking-widest text-amber-300 uppercase">Buổi luyện xong</p>
          <p className="font-display mt-2 text-4xl font-black text-amber-300" aria-label={`${stars} trên 3 sao`}>{starLabel(stars)}</p>
          <p className="mt-2 text-sm text-zinc-300">
            Đúng <span className="arena-num font-bold text-emerald-300">{score}/{total}</span>
            {" · "}ăn ngay <span className="arena-num font-bold text-cyan-300">{firstTry}/{total}</span>
          </p>
          {unknownQs.length > 0 ? (
            <p className="mt-1 text-xs text-amber-300">Xem lại các câu chưa chắc: {unknownQs.join(", ")}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setFinished(false)}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
          >
            Luyện tiếp
          </button>
        </div>
      ) : null}
      {shown ? (
        <p className="text-center text-sm text-zinc-400">
          Đúng <span className="arena-num font-bold text-emerald-300">{score}</span>/{total}
          {mode === "practice" ? (
            <> · ăn ngay <span className="arena-num font-bold text-cyan-300">{firstTry}</span></>
          ) : null}
        </p>
      ) : null}
      {(shown ? questions : null)?.map((q, i) => (
        <div key={i} className={`arena-card rounded-2xl p-5 ${view(marks[i]) === "right" ? "border-emerald-700" : view(marks[i]) === "wrong" ? "border-red-800" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-zinc-500">
              Câu {i + 1} · {q.skill_name} · <span className="font-bold text-amber-300">Lv {q.level}</span>
            </p>
            <button
              type="button"
              onClick={() => toggleUnknown(i)}
              disabled={locked}
              aria-pressed={unknown[i] === true}
              title="Đánh dấu chưa chắc"
              aria-label={`Đánh dấu câu ${i + 1} chưa chắc`}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-40 ${unknown[i] ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"}`}
            >
              {unknown[i] ? "❓ Chưa chắc" : "Đánh dấu"}
            </button>
          </div>
          <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          {mode === "practice" && !finished ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => toggleHint(i)}
                aria-expanded={hintOpen[i] === true}
                className="text-xs font-bold text-cyan-300 underline-offset-2 hover:underline"
              >
                {hintOpen[i] ? "Ẩn gợi ý" : "Xem gợi ý"}
              </button>
              {hintOpen[i] ? (
                <p className="mt-1 rounded-xl border border-cyan-800 bg-cyan-950/40 px-3 py-2 text-sm text-cyan-100">{q.hint}</p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              step="any"
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && mode === "practice") void grade(i);
              }}
              placeholder="Đáp số của bạn"
              aria-label={`Đáp số câu ${i + 1}`}
              disabled={locked || grading || (mode === "practice" && marks[i] === "right")}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            {mode === "practice" ? (
              <button
                type="button"
                onClick={() => void grade(i)}
                disabled={locked || grading || marks[i] === "checking" || marks[i] === "right"}
                aria-label={`Chấm câu ${i + 1}`}
                className="arena-btn-primary shrink-0 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {marks[i] === "checking" ? "…" : view(marks[i]) === "right" ? "✓" : view(marks[i]) === "wrong" ? "Thử lại" : "Chấm"}
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {started && mode === "exam" && !locked ? (
        <div className="sticky bottom-4 flex justify-center">
          <button
            type="button"
            onClick={() => void submitExam()}
            disabled={grading}
            className="arena-btn-primary rounded-full px-8 py-3 font-bold text-white disabled:opacity-60"
          >
            {grading ? `Đang chấm ${progress.done}/${progress.total}…` : "Nộp bài"}
          </button>
        </div>
      ) : null}
      {started && mode === "practice" && !finished ? (
        <div className="sticky bottom-4 flex justify-center">
          <button
            type="button"
            onClick={finishPractice}
            className="arena-btn-primary rounded-full px-8 py-3 font-bold text-white"
          >
            Kết thúc buổi luyện
          </button>
        </div>
      ) : null}
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

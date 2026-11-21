"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStatus } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import StickyTimer from "@/components/education/StickyTimer";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { examExpired, examRemainingMs, formatExamClock, URGENT_MS } from "@/lib/paper/exam";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type HQ = {
  no: number;
  prompt_latex: string;
  options: string[];
  tier: "verified" | "draft";
};
type HSection = {
  id: string;
  name: string;
  minutes: number;
  as_of: string;
  questions: HQ[];
};
type Mark = "idle" | "checking" | "right" | "wrong";

const LETTERS = ["A", "B", "C", "D"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function HsaInner() {
  const search = useSearchParams();
  const day = search.get("day") ?? "";
  const [date, setDate] = useState("");
  const [p3, setP3] = useState("");
  const [sections, setSections] = useState<HSection[] | null>(null);
  // Sequential sections: current index + per-section deadlines (0 = not started).
  const [cur, setCur] = useState(0);
  const [deadlines, setDeadlines] = useState<number[]>([]);
  const [picked, setPicked] = useState<number[][]>([]);
  const [marks, setMarks] = useState<Mark[][]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(0);
  const [gradeNote, setGradeNote] = useState("");

  const storeKey = date && p3 ? `arena_hsa_v1:${date}:${p3}` : "";
  const sectionDone = (a: number) => deadlines[a] > 0 && examExpired(deadlines[a], now);
  const allDone = sections !== null && sections.every((_, a) => sectionDone(a));
  const curExpired = sections !== null && cur < sections.length && deadlines[cur] > 0 && examExpired(deadlines[cur], now);
  const remaining = cur < deadlines.length && deadlines[cur] > 0 ? examRemainingMs(deadlines[cur], now) : 0;
  const urgent = remaining > 0 && remaining < URGENT_MS * 5;

  useEffect(() => {
    if (!sections || allDone) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sections, allDone]);

  // Auto-advance when the current section clock runs out.
  useEffect(() => {
    if (!sections || !curExpired || cur >= sections.length - 1) return;
    const t = setTimeout(() => {
      const t0 = Date.now();
      setDeadlines((d) => d.map((v, k) => (k === cur + 1 && v === 0 ? t0 + (sections[cur + 1].minutes * 60 * 1000) : v)));
      setCur(cur + 1);
      setNow(t0);
    }, 1200);
    return () => clearTimeout(t);
  }, [curExpired, sections, cur]);

  // Throttled persist: per-pick answers would otherwise rewrite the full
  // paper on every selection. Writes at most once per second, immediately
  // when all sections lock, and flushes trailing state on unmount.
  const persistRef = useRef<{ key: string; payload: { sections: HSection[]; cur: number; deadlines: number[]; picked: number[][]; marks: Mark[][] } } | null>(null);
  const lastPersistRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!storeKey || !sections) return;
    persistRef.current = { key: storeKey, payload: { sections, cur, deadlines, picked, marks } };
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
    if (allDone) {
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
  }, [storeKey, sections, cur, deadlines, picked, marks, allDone]);
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

  function chooseP3(choice: string) {
    const wantDay = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayStr();
    try {
      const raw = sessionStorage.getItem(`arena_hsa_v1:${wantDay}:${choice}`);
      const d = raw
        ? (JSON.parse(raw) as { sections: HSection[]; cur: number; deadlines: number[]; picked: number[][]; marks: Mark[][] } | null)
        : null;
      if (d && Array.isArray(d.sections) && d.sections.length === 3 && Array.isArray(d.deadlines)) {
        queueMicrotask(() => {
          setDate(wantDay);
          setP3(choice);
          setSections(d.sections);
          setCur(Math.min(d.cur, 2));
          setDeadlines(d.sections.map((_, a) => (typeof d.deadlines[a] === "number" ? d.deadlines[a] : 0)));
          setPicked(d.sections.map((s, a) => s.questions.map((_, k) => (typeof d.picked[a]?.[k] === "number" ? d.picked[a][k] : -1))));
          setMarks(d.sections.map((s, a) => s.questions.map((_, k) => (d.marks[a]?.[k] === "right" || d.marks[a]?.[k] === "wrong" ? d.marks[a][k] : "idle"))));
          setNow(Date.now());
          setError("");
        });
        return;
      }
    } catch {
      // Corrupt entry: fall through to a fresh mock.
    }
    setLoading(true);
    setError("");
    fetch(`/api/hsa/mock?day=${wantDay}&p3=${choice}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được đề."));
        return readApiJson<{ date: string; sections: HSection[] }>(r, "Không tải được đề.");
      })
      .then((d) => {
        setDate(d.date);
        setP3(choice);
        setSections(d.sections);
        setCur(0);
        setDeadlines(d.sections.map(() => 0));
        setPicked(d.sections.map((s) => s.questions.map(() => -1)));
        setMarks(d.sections.map((s) => s.questions.map(() => "idle" as Mark)));
        setNow(Date.now());
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được đề."))
      .finally(() => setLoading(false));
  }

  function startSection(a: number) {
    const s = sections?.[a];
    if (!s || deadlines[a] > 0) return;
    const t0 = Date.now();
    setDeadlines((d) => d.map((v, k) => (k === a ? t0 + s.minutes * 60 * 1000 : v)));
    setNow(t0);
  }

  function finishSection(a: number) {
    if (!sections || a >= sections.length - 1) {
      // Last section: lock everything by expiring its clock.
      setDeadlines((d) => d.map((v, k) => (k === a ? Math.min(v || Date.now(), Date.now()) : v)));
      setNow(Date.now());
      return;
    }
    const t0 = Date.now();
    setDeadlines((d) => d.map((v, k) => (k === a ? Math.min(v || t0, t0) : k === a + 1 && v === 0 ? t0 + (sections[k].minutes * 60 * 1000) : v)));
    setCur(a + 1);
    setNow(t0);
  }

  async function grade(a: number, i: number) {
    const s = sections?.[a];
    if (!s || a !== cur || sectionDone(a) || picked[a]?.[i] === undefined || picked[a][i] < 0 || marks[a]?.[i] === "checking") return;
    setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? "checking" : v)) : row)));
    setGradeNote("");
    try {
      const r = await fetch("/api/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: s.id, index: i, selected: picked[a][i], as_of: s.as_of }),
      });
      if (r.status === 409) throw new Error("Đề đã đổi — tải lại để lấy đề mới.");
      const d = await readApiJson<{ correct: boolean }>(r, "Chấm thất bại.");
      if (deadlines[a] > 0 && examExpired(deadlines[a], now)) return;
      setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)) : row)));
    } catch (e) {
      setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? "idle" : v)) : row)));
      setGradeNote(e instanceof Error && e.message ? e.message : "Chấm thất bại, thử lại nhé.");
    }
  }

  // Arrow-key pattern for the 4 answer radios of one question (mirrors
  // app/friends onTabKeyDown). Click/Tab+Enter keeps working as before.
  function onRadioKeyDown(e: React.KeyboardEvent, a: number, i: number, k: number, count: number) {
    if (sectionDone(a) || marks[a]?.[i] === "right") return;
    const last = count - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (k + 1) % count
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (k + last) % count
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setPicked((p) => p.map((row, ra) => (ra === a ? row.map((v, kk) => (kk === i ? next : v)) : row)));
  }

  const score = marks.flat().filter((m) => m === "right").length;
  const total = sections?.reduce((t, s) => t + s.questions.length, 0) ?? 150;
  const s = sections?.[cur] ?? null;
  const sLocked = cur < deadlines.length && deadlines[cur] > 0 && examExpired(deadlines[cur], now);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-x-clip px-4 py-8">
      <HeroStatus label={allDone ? "Đã xong cả 3 phần" : deadlines[cur] > 0 ? `Đang thi phần ${cur + 1}` : "Chọn phần thi"}>
        {allDone ? `Đúng ${score}/${total}` : deadlines[cur] > 0 ? (sLocked ? "Hết giờ" : formatExamClock(remaining)) : `150 câu — đề ${date || "…"}`}
      </HeroStatus>
      <PageHeader
        kicker="Thi thử HSA"
        title={<>Bài thi <span className="arena-title">{date || "…"}</span></>}
        sub="Bấm giờ từng phần (75/60/60 phút), máy chấm. Cùng một đề trong 2 ngày. Chỉ để luyện tập: điểm là số câu đúng, không phải điểm HSA chính thức."
        right={
          sections && !allDone && deadlines[cur] > 0 ? (
            <span role="timer" aria-label="Thời gian còn lại của phần thi" className={`shrink-0 font-mono text-sm tabular-nums ${sLocked ? "font-bold text-red-400" : urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
              {sLocked ? "00:00" : formatExamClock(remaining)}
            </span>
          ) : undefined
        }
      />
      <StickyTimer
        show={sections !== null && !allDone && deadlines[cur] > 0}
        label="Thời gian còn lại của phần thi"
        text={sLocked ? "00:00" : formatExamClock(remaining)}
        tone={sLocked ? "expired" : urgent ? "urgent" : "normal"}
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải đề">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">{error}</p>
          <button type="button" onClick={() => setError("")} className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white">
            Đóng
          </button>
        </div>
      ) : null}
      {!sections && !loading ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-zinc-100">Chọn phần 3 của bạn.</h2>
          <p className="text-sm text-zinc-400">Phần 1-2 cố định. Phần 3: Khoa học hoặc Tiếng Anh — giống thi HSA thật.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => chooseP3("hsa_science")} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white">
              Khoa học
            </button>
            <button type="button" onClick={() => chooseP3("hsa_english")} className="arena-btn-ghost rounded-full px-6 py-2.5 font-bold text-zinc-200 transition-colors hover:text-white">
              Tiếng Anh
            </button>
          </div>
        </div>
      ) : null}
      {allDone ? (
        <div role="status" className="arena-enter rounded-2xl bg-red-950/40 p-4 text-center">
          <p className="text-xs font-bold text-red-300">Đã thi xong</p>
          <p className="mt-1 text-sm text-zinc-300 tabular-nums">
            Kết quả <span className="arena-num font-bold text-emerald-300">{score}/{total}</span> câu đúng
            — đề đã khóa.
          </p>
          <Link href={`/exam/review?exam=hsa&day=${date}&p3=${p3}`} className="arena-btn-ghost mt-3 inline-flex min-h-[44px] items-center rounded-full px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:text-white">
            Chữa bài
          </Link>
        </div>
      ) : null}
      {sections && !allDone ? (
        <>
          <div className="flex flex-wrap justify-center gap-2" aria-label="Các phần thi">
            {sections.map((sec, a) => (
              <span
                key={sec.id}
                className={`rounded-full px-4 py-1.5 text-sm font-bold tabular-nums ${a === cur ? "arena-btn-primary text-white" : sectionDone(a) ? "text-zinc-500 line-through" : "arena-btn-ghost text-zinc-300"}`}
              >
                {sec.name} — {sec.minutes} phút
              </span>
            ))}
          </div>
          <p className="text-center text-sm text-zinc-400 tabular-nums">
            Điểm <span className="arena-num font-bold text-emerald-300">{score}</span>/{total} câu đúng

          </p>
          {gradeNote ? (
            <p role="status" className="rounded-2xl border border-amber-500/50 bg-amber-950/40 p-3 text-center text-sm text-amber-200">{gradeNote}</p>
          ) : null}
        </>
      ) : null}
      {s && !allDone && deadlines[cur] === 0 ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-zinc-100">{s.name}: {s.questions.length} câu, {s.minutes} phút.</h2>
          <button type="button" onClick={() => startSection(cur)} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white">
            Bắt đầu phần {cur + 1}
          </button>
        </div>
      ) : null}
      {s && !allDone && deadlines[cur] > 0
        ? s.questions.map((q, i) => {
            const m = marks[cur]?.[i] ?? "idle";
            const view: Mark = sLocked && m !== "right" ? "wrong" : m;
            return (
              <div key={q.no} className={`arena-card rounded-2xl p-5 ${view === "right" ? "border-emerald-700" : view === "wrong" ? "border-red-800" : ""}`}>
                <p className="text-xs text-zinc-500">
                  Câu {q.no} — {s.name} —{" "}
                  {q.tier === "verified" ? (
                    <span className="font-bold text-emerald-300">Đã kiểm chứng</span>
                  ) : (
                    <span className="font-bold text-amber-300">AI soạn</span>
                  )}
                </p>
                <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
                <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={`Các lựa chọn câu ${q.no}`}>
                  {q.options.map((o, k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={picked[cur]?.[i] === k}
                      disabled={sLocked || m === "right"}
                      onClick={() => setPicked((p) => p.map((row, ra) => (ra === cur ? row.map((v, kk) => (kk === i ? k : v)) : row)))}
                      onKeyDown={(e) => onRadioKeyDown(e, cur, i, k, q.options.length)}
                      className={`flex items-center gap-3 rounded-xl px-4 py-2 text-left text-zinc-100 transition-colors disabled:opacity-60 ${picked[cur]?.[i] === k ? "arena-btn-primary" : "arena-btn-ghost hover:text-white"}`}
                    >
                      <span className="arena-num font-bold">{LETTERS[k]}</span>
                      <MathText text={o} className="min-w-0 flex-1" />
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Link
                    href={`/tutor?ctx=exam&section=${encodeURIComponent(s.id)}&index=${i}&as_of=${encodeURIComponent(s.as_of)}`}
                    aria-label={`Hỏi gia sư về câu ${q.no}`}
                    className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:text-white"
                  >
                    Hỏi gia sư
                  </Link>
                  <button
                    type="button"
                    onClick={() => void grade(cur, i)}
                    disabled={sLocked || m === "checking" || m === "right" || (picked[cur]?.[i] ?? -1) < 0}
                    aria-label={`Chấm câu ${q.no}`}
                    className="arena-btn-primary inline-flex shrink-0 items-center gap-1 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {m === "checking" ? "Đang chấm…" : view === "right" ? <><CheckIcon className="h-4 w-4" label="Đúng" /> Đúng</> : view === "wrong" ? (sLocked ? <XIcon className="h-4 w-4" label="Sai" /> : "Thử lại") : "Chấm"}
                  </button>
                </div>
              </div>
            );
          })
        : null}
      {s && !allDone && deadlines[cur] > 0 && !sLocked ? (
        <button
          type="button"
          onClick={() => finishSection(cur)}
          className="arena-btn-ghost mx-auto rounded-full px-6 py-2.5 font-bold text-zinc-200 transition-colors hover:text-white"
        >
          {cur < (sections?.length ?? 0) - 1 ? `Xong phần ${cur + 1} — sang phần ${cur + 2}` : "Nộp bài"}
        </button>
      ) : null}
    </main>
  );
}

export default function HsaPage() {
  return (
    <Suspense>
      <HsaInner />
    </Suspense>
  );
}

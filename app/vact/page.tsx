"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStatus } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import StickyTimer from "@/components/education/StickyTimer";
import { CheckIcon, XIcon } from "@/components/ui/icons";
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
  const [gradeNote, setGradeNote] = useState("");

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
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được đề."));
        return readApiJson<{ date: string; sections: VSection[] }>(r, "Không tải được đề.");
      })
      .then((d) => {
        if (!alive) return;
        setDate(d.date);
        setSections(d.sections);
        setPicked(d.sections.map((s) => s.questions.map(() => -1)));
        setMarks(d.sections.map((s) => s.questions.map(() => "idle" as Mark)));
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

  async function grade(a: number, i: number) {
    const s = sections?.[a];
    if (!s || picked[a]?.[i] === undefined || picked[a][i] < 0 || marks[a]?.[i] === "checking" || locked) return;
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
      if (started && examExpired(deadline, now)) return;
      setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)) : row)));
    } catch (e) {
      setMarks((m) => m.map((row, ra) => (ra === a ? row.map((v, k) => (k === i ? "idle" : v)) : row)));
      setGradeNote(e instanceof Error && e.message ? e.message : "Chấm thất bại, thử lại nhé.");
    }
  }

  // ARIA tabs keyboard pattern (mirrors app/friends onTabKeyDown): arrows
  // move between tabs, Home/End jump. Click/Tab+Enter keeps working.
  function onTabKeyDown(e: React.KeyboardEvent, idx: number) {
    const n = sections?.length ?? 0;
    if (n < 2) return;
    const last = n - 1;
    const next =
      e.key === "ArrowRight" ? (idx + 1) % n
      : e.key === "ArrowLeft" ? (idx + last) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(next);
  }

  // Same arrow-key pattern for the 4 answer radios of one question.
  function onRadioKeyDown(e: React.KeyboardEvent, a: number, i: number, k: number, count: number) {
    if (locked || marks[a]?.[i] === "right") return;
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

  const score = marks.flat().filter((m) => (locked && m !== "right" ? "wrong" : m) === "right").length;
  const total = sections?.reduce((t, s) => t + s.questions.length, 0) ?? 120;
  const cur = sections?.[tab] ?? null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 overflow-x-clip px-4 py-8">
      <HeroStatus label={locked ? "Đã nộp bài" : started ? "Đang thi" : "Sẵn sàng"}>
        {locked ? `Đúng ${score}/${total}` : started ? (expired ? "Hết giờ" : formatExamClock(remaining)) : `120 câu — đề ${date || "…"}`}
      </HeroStatus>
      <PageHeader
        kicker="Thi thử V-ACT"
        title={<>Bài thi <span className="arena-title">{date || "…"}</span></>}
        sub="150 phút, máy chấm. Cùng một đề trong 2 ngày. Chỉ để luyện tập: điểm là số câu đúng, không phải điểm V-ACT chính thức (thi thật dùng IRT)."
        right={
          started ? (
            <span role="timer" aria-label="Thời gian còn lại" className={`shrink-0 font-mono text-sm tabular-nums ${expired ? "font-bold text-red-400" : urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
              {expired ? "00:00" : formatExamClock(remaining)}
            </span>
          ) : undefined
        }
      />
      <StickyTimer
        show={started}
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
          <p role="alert" className="text-sm text-zinc-300">{error}</p>
          <button
            type="button"
            onClick={() => {
              setStarted(false);
              setDeadline(0);
              setRetry((r) => r + 1);
            }}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {sections && !started ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-zinc-100">Đề đã sẵn sàng, đồng hồ cũng vậy.</h2>
          <p className="text-sm text-zinc-400">120 câu, 150 phút. Bấm giờ bắt đầu khi bạn vào thi.</p>
          <button type="button" onClick={startExam} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white">
            Vào phòng thi
          </button>
        </div>
      ) : null}
      {expired ? (
        <div role="status" className="arena-enter rounded-2xl bg-red-950/40 p-4 text-center">
          <p className="text-xs font-bold text-red-300">Hết giờ</p>
          <p className="mt-1 text-sm text-zinc-300 tabular-nums">
            Kết quả <span className="arena-num font-bold text-emerald-300">{score}/{total}</span> câu đúng
            — đề đã khóa.
          </p>
          <Link href={`/exam/review?exam=vact&day=${date}`} className="arena-btn-ghost mt-3 inline-block rounded-full px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:text-white">
            Chữa bài
          </Link>
        </div>
      ) : null}
      {sections && started ? (
        <>
          <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Các phần thi">
            {sections.map((s, a) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={tab === a}
                onClick={() => setTab(a)}
                onKeyDown={(e) => onTabKeyDown(e, a)}
                className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${tab === a ? "arena-btn-primary text-white" : "arena-btn-ghost text-zinc-300 hover:text-white"}`}
              >
                {s.name}
              </button>
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
      {cur && started
        ? cur.questions.map((q, i) => {
            const m = marks[tab]?.[i] ?? "idle";
            const view: Mark = locked && m !== "right" ? "wrong" : m;
            return (
              <div key={q.no} className={`arena-card rounded-2xl p-5 ${view === "right" ? "border-emerald-700" : view === "wrong" ? "border-red-800" : ""}`}>
                <p className="text-xs text-zinc-500">
                  Câu {q.no} — {cur.name} —{" "}
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
                      aria-checked={picked[tab]?.[i] === k}
                      disabled={locked || m === "right"}
                      onClick={() => setPicked((p) => p.map((row, ra) => (ra === tab ? row.map((v, kk) => (kk === i ? k : v)) : row)))}
                      onKeyDown={(e) => onRadioKeyDown(e, tab, i, k, q.options.length)}
                      className={`flex items-center gap-3 rounded-xl px-4 py-2 text-left text-zinc-100 transition-colors disabled:opacity-60 ${picked[tab]?.[i] === k ? "arena-btn-primary" : "arena-btn-ghost hover:text-white"}`}
                    >
                      <span className="arena-num font-bold">{LETTERS[k]}</span>
                      <MathText text={o} className="min-w-0 flex-1" />
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Link
                    href={`/tutor?ctx=exam&section=${encodeURIComponent(cur.id)}&index=${i}&as_of=${encodeURIComponent(cur.as_of)}`}
                    aria-label={`Hỏi gia sư về câu ${q.no}`}
                    className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:text-white"
                  >
                    Hỏi gia sư
                  </Link>
                  <button
                    type="button"
                    onClick={() => void grade(tab, i)}
                    disabled={locked || m === "checking" || m === "right" || (picked[tab]?.[i] ?? -1) < 0}
                    aria-label={`Chấm câu ${q.no}`}
                    className="arena-btn-primary inline-flex shrink-0 items-center gap-1 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {m === "checking" ? "Đang chấm…" : view === "right" ? <><CheckIcon className="h-4 w-4" label="Đúng" /> Đúng</> : view === "wrong" ? (locked ? <XIcon className="h-4 w-4" label="Sai" /> : "Thử lại") : "Chấm"}
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

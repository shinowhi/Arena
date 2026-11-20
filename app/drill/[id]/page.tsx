"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import MathText from "@/components/MathText";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStatus } from "@/components/ui/Hero";
import { BulbIcon, CheckIcon, XIcon } from "@/components/ui/icons";
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
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được bộ luyện."));
        return readApiJson<DrillView>(r, "Không tải được bộ luyện.");
      })
      .then((d) => {
        if (!alive) return;
        setDrill(d);
        setAnswers(d.questions.map(() => ""));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được bộ luyện.");
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
      if (!r.ok) throw new Error(await readApiError(r, "Nộp bài thất bại."));
      setResult(await readApiJson<Result>(r, "Nộp bài thất bại."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nộp bài thất bại.");
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

  const answered = answers.filter((a) => a.trim() !== "").length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStatus label={result ? "Đã chấm xong" : drill ? "Đang làm bài" : "Bộ luyện"}>
        {result ? `Điểm ${result.score}/${result.total}` : drill ? `${answered}/${drill.questions.length} đã làm` : "Đang tải…"}
      </HeroStatus>
      <PageHeader
        kicker="Bộ luyện"
        title={drill ? <span className="text-wrap-balance">{drill.title}</span> : "…"}
        sub={
          drill
            ? `${drill.questions.length} câu — chấm trên máy chủ khi bạn nộp cả bộ.`
            : undefined
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
              Thử lại
            </button>
            <Link
              href="/drill"
              className="arena-btn-ghost inline-block min-h-[48px] rounded-full px-5 py-3 text-sm font-medium text-zinc-200"
            >
              Về trung tâm
            </Link>
          </div>
        </div>
      ) : null}
      {!drill && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải bộ luyện">
          <div className="arena-shimmer h-24 rounded-2xl" />
          <p className="text-center text-sm text-zinc-500">Đang tải bộ của bạn…</p>
        </div>
      ) : null}
      {result ? (
        <section className="arena-enter arena-card flex flex-col gap-3 rounded-2xl p-5" aria-label="Kết quả luyện tập">
          <p className="text-center text-lg font-extrabold text-zinc-100">
            Điểm <span className="arena-num text-emerald-300">{result.score}</span>
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
          <nav className="flex flex-col gap-2" aria-label="Bước tiếp theo">
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
            Làm lại bộ này
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
            <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <span>
                Câu {i + 1} — <span className="font-bold text-amber-300">Cấp {q.level}</span>{" "}
                {skillName(q.skill_tag)}
              </span>
              {mark === true ? <CheckIcon className="h-4 w-4 text-emerald-300" label="đúng" /> : null}
              {mark === false ? <XIcon className="h-4 w-4 text-red-400" label="sai" /> : null}
            </p>
            <MathText text={q.prompt_latex} className="mt-1 min-h-[48px] overflow-x-auto text-lg text-zinc-100" />
            <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
              <BulbIcon className="h-4 w-4" /> Gợi ý: {q.hint}
            </p>
            <input
              type="number"
              step="any"
              value={answers[i] ?? ""}
              onChange={(e) => setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))}
              placeholder="Đáp án số của bạn"
              aria-label={`Đáp án cho câu ${i + 1}`}
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
          {submitting ? "Đang chấm…" : `Nộp ${drill.questions.length} câu`}
        </button>
      ) : null}
    </main>
  );
}

// useParams must stream inside Suspense (Next 16 prerender rule).
export default function DrillRunnerPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-center text-sm text-zinc-500">Đang tải bộ của bạn…</p>}>
      <DrillRunner />
    </Suspense>
  );
}

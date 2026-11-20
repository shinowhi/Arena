"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStat } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import { BulbIcon, CheckIcon } from "@/components/ui/icons";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Item = {
  boss_id: string;
  question_index: number;
  skill_tag: string;
  skill_name: string;
  level: number;
  prompt_latex: string;
  hint: string;
  check: unknown;
  tolerance: number;
  missed_at: string;
};
type Mark = "idle" | "checking" | "right" | "wrong";

export default function MissesPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [gradeNote, setGradeNote] = useState("");

  useEffect(() => {
    let alive = true;
    // Microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => {
      if (!alive) return;
      setError("");
      setItems(null);
    });
    fetch("/api/misses")
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được danh sách câu sai."));
        return readApiJson<{ items: Item[] }>(r, "Không tải được danh sách câu sai.");
      })
      .then((d) => {
        if (!alive) return;
        setItems(d.items);
        setAnswers(d.items.map(() => ""));
        setMarks(d.items.map(() => "idle" as Mark));
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được danh sách câu sai.");
      });
    return () => {
      alive = false;
    };
  }, [retry]);

  async function grade(i: number) {
    const q = items?.[i];
    if (!q || marks[i] === "checking" || marks[i] === "right") return;
    const n = Number(answers[i]);
    if ((answers[i] ?? "").trim() === "" || !Number.isFinite(n)) return;
    setMarks((m) => m.map((v, k) => (k === i ? "checking" : v)));
    setGradeNote("");
    try {
      const r = await fetch("/api/paper/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: q.check, tolerance: q.tolerance, answer: n }),
      });
      const d = await readApiJson<{ correct: boolean }>(r, "Chấm thất bại.");
      setMarks((m) => m.map((v, k) => (k === i ? (d.correct ? "right" : "wrong") : v)));
    } catch {
      setMarks((m) => m.map((v, k) => (k === i ? "idle" : v)));
      setGradeNote("Chấm thất bại, thử lại nhé.");
    }
  }

  const cleared = marks.filter((m) => m === "right").length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStat
        value={items ? `${cleared}/${items.length}` : "…"}
        label="câu sai đã chữa"
        hint="Đúng những câu bạn đã làm sai — chữa hết chúng nhé"
      />
      <PageHeader
        kicker="Cơ hội thứ hai"
        title={<>Hàng đợi <span className="arena-title">câu sai</span></>}
        sub="Xếp hàng chờ phục thù."
      />
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {gradeNote ? (
        <p role="status" className="rounded-2xl border border-amber-500/50 bg-amber-950/40 p-3 text-center text-sm text-amber-200">{gradeNote}</p>
      ) : null}
      {!items && !error ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải câu sai">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {items && items.length === 0 ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-zinc-100">Hàng đợi trống.</h2>
          <p className="text-sm text-zinc-400">Chưa ghi nhận câu sai nào — đánh boss để lấp đầy nhé.</p>
          <Link href="/arena" className="arena-btn-primary rounded-full px-5 py-2 text-sm font-bold text-white">
            Tìm boss
          </Link>
        </div>
      ) : null}
      {items?.map((q, i) => (
        <div key={`${q.boss_id}:${q.question_index}`} className={`arena-card rounded-2xl p-5 ${marks[i] === "right" ? "border-emerald-700" : marks[i] === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs font-bold text-zinc-500">
            {q.skill_name} — <span className="font-bold text-amber-300">Cấp {q.level}</span>
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
              aria-label={`Đáp án câu sai thứ ${i + 1}`}
              disabled={marks[i] === "right"}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <Link
              href={`/tutor?ctx=miss&boss=${encodeURIComponent(q.boss_id)}&idx=${q.question_index}`}
              aria-label={`Hỏi gia sư về câu sai thứ ${i + 1}`}
              className="arena-btn-ghost shrink-0 rounded-full px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:text-white"
            >
              Hỏi gia sư
            </Link>
            <button
              type="button"
              onClick={() => void grade(i)}
              disabled={marks[i] === "checking" || marks[i] === "right"}
              aria-label={
                marks[i] === "checking"
                  ? `Đang chấm câu ${i + 1}`
                  : marks[i] === "right"
                    ? `Câu ${i + 1} đã chữa xong`
                    : marks[i] === "wrong"
                      ? `Câu ${i + 1} sai, thử lại`
                      : `Chấm câu ${i + 1}`
              }
              className="arena-btn-primary inline-flex shrink-0 items-center gap-1 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {marks[i] === "checking" ? "Đang chấm…" : marks[i] === "right" ? <><CheckIcon className="h-4 w-4" label="Đã xong" /> Đã chữa</> : marks[i] === "wrong" ? "Thử lại" : "Chấm"}
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}

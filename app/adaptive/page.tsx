"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStat } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import { CheckIcon } from "@/components/ui/icons";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";
import { levelForRating, sm2Next, START_RATING, updateRating } from "@/lib/game/adaptive";

type Stat = { rating: number; games: number };
type Q = { prompt_latex: string; hint: string; tolerance: number; check: unknown };
type Due = Q & { skill_tag: string; skill_name: string; level: number; reps: number; interval: number; due: number };
type NextQ = { skill_tag: string; skill_name: string; level: number; rating: number; question: Q };
type Mark = "idle" | "checking" | "right" | "wrong";

const STATS_KEY = "arena_adaptive_v1:stats";
const DUE_KEY = "arena_adaptive_v1:due";

export default function AdaptivePage() {
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [due, setDue] = useState<Due[]>([]);
  const [cur, setCur] = useState<(NextQ & { mode: "drill" | "review"; reviewKey: string | null }) | null>(null);
  const [answer, setAnswer] = useState("");
  const [mark, setMark] = useState<Mark>("idle");
  const [tried, setTried] = useState(false);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gradeNote, setGradeNote] = useState("");

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(STATS_KEY);
      const d = sessionStorage.getItem(DUE_KEY);
      const ps = s ? (JSON.parse(s) as Record<string, Stat>) : null;
      const pd = d ? (JSON.parse(d) as Due[]) : null;
      if (ps || pd) {
        queueMicrotask(() => {
          if (ps) setStats(ps);
          if (pd) setDue(pd);
        });
      }
    } catch {
      // Corrupt entries: start fresh.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STATS_KEY, JSON.stringify(stats));
      sessionStorage.setItem(DUE_KEY, JSON.stringify(due));
    } catch {
      // Quota/private mode: drill still works.
    }
  }, [stats, due]);

  async function fetchNext(s: Record<string, Stat>, d: Due[]) {
    setLoading(true);
    setError("");
    setGradeNote("");
    setAnswer("");
    setMark("idle");
    setTried(false);
    try {
      const now = Date.now();
      const ready = d.filter((x) => x.due <= now).sort((a, b) => a.due - b.due)[0];
      if (ready) {
        setCur({
          skill_tag: ready.skill_tag,
          skill_name: ready.skill_name,
          level: ready.level,
          rating: s[ready.skill_tag]?.rating ?? START_RATING,
          question: ready,
          mode: "review",
          reviewKey: `${ready.skill_tag}|${ready.prompt_latex}`,
        });
      } else {
        const r = await fetch("/api/adaptive/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stats: s }),
        });
        if (!r.ok) throw new Error(await readApiError(r, "Không lấy được câu tiếp theo."));
        const q = await readApiJson<NextQ>(r, "Không lấy được câu tiếp theo.");
        setCur({ ...q, mode: "drill", reviewKey: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lấy được câu tiếp theo.");
    } finally {
      setLoading(false);
    }
  }

  async function check() {
    if (!cur || mark === "checking" || answer.trim() === "" || !Number.isFinite(Number(answer))) return;
    setMark("checking");
    setGradeNote("");
    try {
      const r = await fetch("/api/paper/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: cur.question.check, tolerance: cur.question.tolerance, answer: Number(answer) }),
      });
      if (!r.ok) throw new Error(await readApiError(r, "Chấm thất bại."));
      const d = await readApiJson<{ correct: boolean }>(r, "Chấm thất bại.");
      // First attempt counts; retries only change the display mark.
      const firstTry = !tried;
      setTried(true);
      let ns = stats;
      let nd = due;
      if (firstTry) {
        const st = stats[cur.skill_tag] ?? { rating: START_RATING, games: 0 };
        ns = { ...stats, [cur.skill_tag]: { rating: updateRating(st.rating, cur.level, d.correct), games: st.games + 1 } };
        setStats(ns);
        setStreak((x) => (d.correct ? x + 1 : 0));
        if (cur.mode === "review" && cur.reviewKey) {
          const key = cur.reviewKey;
          const item = due.find((x) => `${x.skill_tag}|${x.prompt_latex}` === key);
          if (item) {
            const nx = sm2Next(item.reps, item.interval, d.correct ? 5 : 0);
            nd =
              nx.reps >= 3 && d.correct
                ? due.filter((x) => `${x.skill_tag}|${x.prompt_latex}` !== key)
                : due.map((x) =>
                    `${x.skill_tag}|${x.prompt_latex}` === key
                      ? { ...x, reps: nx.reps, interval: nx.intervalDays, due: Date.now() + nx.intervalDays * 86400000 }
                      : x,
                  );
            setDue(nd);
          }
        } else if (cur.mode === "drill" && !d.correct) {
          nd = [
            ...due.slice(-29),
            { ...cur.question, skill_tag: cur.skill_tag, skill_name: cur.skill_name, level: cur.level, reps: 0, interval: 1, due: Date.now() + 86400000 },
          ];
          setDue(nd);
        }
      }
      setMark(d.correct ? "right" : "wrong");
      if (d.correct) setTimeout(() => void fetchNext(ns, nd), 900);
    } catch {
      setMark("idle");
      setGradeNote("Chấm thất bại, thử lại nhé.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStat
        value={streak}
        label="câu đúng liên tiếp"
        hint={cur ? `${cur.skill_name} — cấp tiếp theo: Cấp ${levelForRating(cur.rating)}` : "Kỹ năng yếu nhất trước, cấp độ theo trình độ của bạn"}
      />
      <PageHeader
        kicker="Luyện thích ứng"
        title={<>Đúng <span className="arena-title">trình độ</span> của bạn</>}
        sub="Câu làm sai sẽ quay lại đúng hẹn."
      />
      {error ? (
        <div className="arena-card rounded-2xl p-4 text-center">
          <p role="alert" className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={() => void fetchNext(stats, due)} className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white">
            Thử lại
          </button>
        </div>
      ) : null}
      {gradeNote ? (
        <p role="status" className="rounded-2xl border border-amber-500/50 bg-amber-950/40 p-3 text-center text-sm text-amber-200">{gradeNote}</p>
      ) : null}
      {!cur && !loading ? (
        <div className="arena-card flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <h2 className="font-display text-xl font-extrabold text-zinc-100">Sẵn sàng là luyện ngay.</h2>
          <button type="button" onClick={() => void fetchNext(stats, due)} className="arena-btn-primary rounded-full px-6 py-2.5 font-bold text-white">
            Bắt đầu luyện
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải câu hỏi">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {cur && !loading ? (
        <div className={`arena-card rounded-2xl p-5 ${mark === "right" ? "border-emerald-700" : mark === "wrong" ? "border-red-800" : ""}`}>
          <p className="text-xs text-zinc-500">
            {cur.mode === "review" ? <span className="font-bold text-amber-300">Ôn lại</span> : <span className="font-bold text-sky-300">Luyện</span>}
            {" — "}{cur.skill_name} — <span className="font-bold text-amber-300">Cấp {cur.level}</span>
            {" — "}điểm <span className="arena-num font-bold text-zinc-200 tabular-nums">{cur.rating}</span>
            {" → "}cấp tiếp theo: Cấp {levelForRating(cur.rating)}
          </p>
          <MathText text={cur.question.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
          <p className="mt-1 text-sm text-zinc-400">Gợi ý: {cur.question.hint}</p>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              step="any"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void check();
              }}
              placeholder="Đáp số của bạn"
              aria-label="Đáp án bài luyện thích ứng"
              disabled={mark === "right"}
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2 text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void check()}
              disabled={mark === "checking" || mark === "right"}
              aria-label={mark === "checking" ? "Đang chấm" : mark === "right" ? "Đã đúng" : "Chấm đáp án"}
              className="arena-btn-primary inline-flex shrink-0 items-center gap-1 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {mark === "checking" ? "Đang chấm…" : mark === "right" ? <><CheckIcon className="h-4 w-4" label="Đúng" /> Đúng</> : mark === "wrong" ? "Thử lại" : "Chấm"}
            </button>
          </div>
          {mark === "wrong" ? (
            <button type="button" onClick={() => void fetchNext(stats, due)} className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:text-white">
              Bỏ qua — câu tiếp theo
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

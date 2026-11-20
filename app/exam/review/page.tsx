"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { HeroStat } from "@/components/ui/Hero";
import MathText from "@/components/MathText";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type RQ = {
  no: number;
  prompt_latex: string;
  options: string[];
  tier: "verified" | "draft";
  answer_index: number;
};
type RSection = {
  id: string;
  name: string;
  as_of: string;
  questions: RQ[];
};

const LETTERS = ["A", "B", "C", "D"];

function ReviewInner() {
  const search = useSearchParams();
  const exam = search.get("exam") ?? "";
  const day = search.get("day") ?? "";
  const p3 = search.get("p3") ?? "";
  const [sections, setSections] = useState<RSection[] | null>(null);
  const [picks, setPicks] = useState<Map<string, number[]>>(new Map());
  const [tab, setTab] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError("");
      setSections(null);
    });
    // Picks live in the exam page's session entry (same tab).
    try {
      const key = exam === "vact" ? `arena_vact_v1:${day}` : `arena_hsa_v1:${day}:${p3}`;
      const raw = sessionStorage.getItem(key);
      const d = raw ? (JSON.parse(raw) as { sections: Array<{ id: string }>; picked: number[][] } | null) : null;
      if (d && Array.isArray(d.sections) && Array.isArray(d.picked)) {
        const m = new Map<string, number[]>();
        d.sections.forEach((s, a) => {
          if (s && typeof s.id === "string" && Array.isArray(d.picked[a])) m.set(s.id, d.picked[a]);
        });
        queueMicrotask(() => {
          if (alive) setPicks(m);
        });
      }
    } catch {
      // No stored picks: review still shows the key.
    }
    const qs =
      exam === "hsa"
        ? `exam=hsa&day=${encodeURIComponent(day)}&p3=${encodeURIComponent(p3)}`
        : `exam=${encodeURIComponent(exam)}&day=${encodeURIComponent(day)}`;
    fetch(`/api/exam/review?${qs}`)
      .then(async (r) => {
        // 403 = paper still running: show the server message (with the wait)
        // instead of keys.
        if (r.status === 403) {
          const d = (await r.json().catch(() => null)) as { error?: unknown; retryAfterSec?: unknown } | null;
          const msg = typeof d?.error === "string" && d.error ? d.error : "Bài thi vẫn đang diễn ra.";
          const secs = typeof d?.retryAfterSec === "number" && Number.isFinite(d.retryAfterSec) ? d.retryAfterSec : 0;
          const wait = secs > 0 ? ` Thử lại sau ${Math.ceil(secs / 60)} phút.` : "";
          throw new Error(`${msg}${wait}`);
        }
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được bài chữa."));
        return readApiJson<{ sections: RSection[] }>(r, "Không tải được bài chữa.");
      })
      .then((d) => {
        if (!alive) return;
        setSections(d.sections);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được bài chữa.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [exam, day, p3, retry]);

  const total = sections?.reduce((t, s) => t + s.questions.length, 0) ?? 0;
  const score =
    sections?.reduce((t, s) => t + s.questions.filter((q, i) => picks.get(s.id)?.[i] === q.answer_index).length, 0) ?? 0;
  const cur = sections?.[tab] ?? null;
  const backHref = exam === "hsa" ? "/hsa" : "/vact";

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroStat
        value={sections ? `${score}/${total}` : "…"}
        label="câu đúng"
        hint="Xanh là đúng — đỏ là câu bạn đã chọn nhầm"
      />
      <PageHeader
        kicker="Chữa bài"
        title={<>Chữa bài <span className="arena-title">{day || "…"}</span></>}
        sub="Đáp án của bạn so với đáp án đúng. Chỉ để luyện tập: điểm này không tương đương điểm thi chính thức."
        right={
          <Link href={backHref} className="arena-btn-ghost shrink-0 rounded-full px-4 py-1.5 text-sm font-bold text-zinc-200 transition-colors hover:text-white">
            Về bài thi
          </Link>
        }
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Đang tải bài chữa">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">{error}</p>
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {sections ? (
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
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${tab === a ? "arena-btn-primary text-white" : "arena-btn-ghost text-zinc-300 hover:text-white"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {cur
        ? cur.questions.map((q, i) => {
            const pick = picks.get(cur.id)?.[i] ?? -1;
            const hit = pick === q.answer_index;
            return (
              <div key={q.no} className={`arena-card rounded-2xl p-5 ${pick < 0 ? "" : hit ? "border-emerald-700" : "border-red-800"}`}>
                <p className="text-xs text-zinc-500">
                  Câu {q.no} — {cur.name} —{" "}
                  {q.tier === "verified" ? (
                    <span className="font-bold text-emerald-300">Đã kiểm chứng</span>
                  ) : (
                    <span className="font-bold text-amber-300">AI soạn</span>
                  )}{" "}
                  — {pick < 0 ? <span className="text-zinc-400">Chưa trả lời</span> : hit ? <span className="inline-flex items-center gap-1 font-bold text-emerald-300"><CheckIcon className="h-3.5 w-3.5" label="Đúng" /> Bạn đúng</span> : <span className="inline-flex items-center gap-1 font-bold text-red-300"><XIcon className="h-3.5 w-3.5" label="Sai" /> Bạn sai</span>}
                </p>
                <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
                <div className="mt-3 flex flex-col gap-2" role="group" aria-label={`Đáp án đúng câu ${q.no}`}>
                  {q.options.map((o, k) => {
                    const isKey = k === q.answer_index;
                    const isPick = k === pick;
                    return (
                      <div
                        key={k}
                        className={`flex items-center gap-3 rounded-xl px-4 py-2 text-zinc-100 ${isKey ? "border border-emerald-700 bg-emerald-950/40" : isPick ? "border border-red-800 bg-red-950/40" : "opacity-70"}`}
                      >
                        <span className="arena-num font-bold">{LETTERS[k]}</span>
                        <MathText text={o} className="min-w-0 flex-1" />
                        {isKey ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300"><CheckIcon className="h-3.5 w-3.5" /> Đáp án</span> : null}
                        {isPick && !isKey ? <span className="text-xs font-bold text-red-300">Bạn chọn</span> : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/tutor?ctx=exam&section=${encodeURIComponent(cur.id)}&index=${i}&as_of=${encodeURIComponent(cur.as_of)}`}
                    aria-label={`Hỏi gia sư về câu ${q.no}`}
                    className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:text-white"
                  >
                    Hỏi gia sư
                  </Link>
                </div>
              </div>
            );
          })
        : null}
    </main>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewInner />
    </Suspense>
  );
}

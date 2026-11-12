"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MathText from "@/components/MathText";
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
          const msg = typeof d?.error === "string" && d.error ? d.error : "This paper is still running.";
          const secs = typeof d?.retryAfterSec === "number" && Number.isFinite(d.retryAfterSec) ? d.retryAfterSec : 0;
          const wait = secs > 0 ? ` Try again in ${Math.ceil(secs / 60)} min.` : "";
          throw new Error(`${msg}${wait}`);
        }
        if (!r.ok) throw new Error(await readApiError(r, "Review failed."));
        return readApiJson<{ sections: RSection[] }>(r, "Review failed.");
      })
      .then((d) => {
        if (!alive) return;
        setSections(d.sections);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Review failed.");
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Answer review"
        title={<>Review <span className="arena-title">{day || "…"}</span></>}
        sub="Your picks against the key. Green is correct — red is what you chose instead. Practice only: this score is not equivalent to the official exam."
        right={
          <Link href={backHref} className="arena-btn-ghost shrink-0 rounded-full px-4 py-1.5 text-sm font-bold text-zinc-200">
            Back to exam
          </Link>
        }
      />
      {loading ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading review">
          <div className="arena-shimmer h-24 rounded-2xl" />
        </div>
      ) : null}
      {error ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p role="alert" className="text-sm text-zinc-300">{error}</p>
          <button
            type="button"
            onClick={() => setRetry((r) => r + 1)}
            className="arena-btn-ghost mt-3 rounded-full px-5 py-2 text-sm font-medium text-zinc-200"
          >
            Retry
          </button>
        </div>
      ) : null}
      {sections ? (
        <>
          <p className="text-center text-sm text-zinc-400">
            Score <span className="arena-num font-bold text-emerald-300">{score}</span>/{total} correct
          </p>
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
        </>
      ) : null}
      {cur
        ? cur.questions.map((q, i) => {
            const pick = picks.get(cur.id)?.[i] ?? -1;
            const hit = pick === q.answer_index;
            return (
              <div key={q.no} className={`arena-card rounded-2xl p-5 ${pick < 0 ? "" : hit ? "border-emerald-700" : "border-red-800"}`}>
                <p className="text-xs text-zinc-500">
                  Q{q.no} · {cur.name} ·{" "}
                  {q.tier === "verified" ? (
                    <span className="font-bold text-emerald-300">Verified</span>
                  ) : (
                    <span className="font-bold text-amber-300">AI draft</span>
                  )}{" "}
                  · {pick < 0 ? <span className="text-zinc-400">Not answered</span> : hit ? <span className="font-bold text-emerald-300">You ✓</span> : <span className="font-bold text-red-300">You ✗</span>}
                </p>
                <MathText text={q.prompt_latex} className="mt-1 overflow-x-auto text-lg text-zinc-100" />
                <div className="mt-3 flex flex-col gap-2" aria-label={`Answer key for question ${q.no}`}>
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
                        {isKey ? <span className="text-xs font-bold text-emerald-300">Key</span> : null}
                        {isPick && !isKey ? <span className="text-xs font-bold text-red-300">You</span> : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/tutor?ctx=exam&section=${encodeURIComponent(cur.id)}&index=${i}&as_of=${encodeURIComponent(cur.as_of)}`}
                    aria-label={`Ask the tutor about question ${q.no}`}
                    className="arena-btn-ghost rounded-full px-5 py-2 text-sm font-bold text-zinc-200"
                  >
                    Ask tutor
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

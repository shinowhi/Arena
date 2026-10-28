"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import katex from "katex";

type BossView = {
  id: string;
  skill_tag: string;
  current_hp: number;
  max_hp: number;
  status: string;
  despawn_at: string;
  correct_indices: number[];
  questions: Array<{ level: number; prompt_latex: string; hint: string }>;
};

function fmt(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

function BossInner() {
  const { id } = useParams<{ id: string }>();
  const [boss, setBoss] = useState<BossView | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/boss/" + id)
      .then(async (r) => {
        const d = (await r.json()) as BossView & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        setBoss(d);
        const done = new Set<number>(d.correct_indices);
        let i = 0;
        while (i < d.questions.length && done.has(i)) i++;
        setIdx(i);
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "Load failed."));
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function attack() {
    if (!boss || busy || boss.status !== "ALIVE") return;
    const n = Number(answer);
    if (!Number.isFinite(n)) {
      setMsg("Enter a number.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/boss/" + id + "/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_index: idx, answer: n }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Attack failed.");
      setBoss({ ...boss, current_hp: d.current_hp, status: d.status });
      if (d.correct) {
        setMsg("Hit! -" + d.damage + " HP");
        setAnswer("");
        setIdx((i) => i + 1);
      } else {
        setMsg("Miss. Check the hint and try again.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Attack failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!boss) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <p>{msg || "Loading boss..."}</p>
      </main>
    );
  }
  const q = boss.questions[Math.min(idx, boss.questions.length - 1)];
  const pct = Math.max(0, (boss.current_hp / boss.max_hp) * 100);
  const left = new Date(boss.despawn_at).getTime() - now;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Boss: {boss.skill_tag}</h1>
        <span className="text-sm tabular-nums text-zinc-500">{fmt(left)}</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-zinc-600">
        HP {boss.current_hp}/{boss.max_hp} — {boss.status}
      </p>
      {boss.status === "DEAD" ? (
        <div className="rounded-lg border p-4">
          <p className="text-lg font-semibold">Boss slain. Skill patched.</p>
          <a href="/scan" className="text-sm underline">
            Scan another work
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm text-zinc-500">
            Question {Math.min(idx + 1, boss.questions.length)}/{boss.questions.length} — level {q.level}
          </p>
          <div
            className="text-lg"
            dangerouslySetInnerHTML={{ __html: katex.renderToString(q.prompt_latex, { throwOnError: false }) }}
          />
          <p className="text-sm text-zinc-600">Hint: {q.hint}</p>
          <div className="flex gap-2">
            <input
              type="number"
              step="any"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") attack();
              }}
              placeholder="Your numeric answer"
              className="flex-1 rounded border px-3 py-2"
            />
            <button
              onClick={attack}
              disabled={busy}
              className="rounded-full bg-zinc-900 px-5 py-2 font-medium text-white disabled:opacity-40"
            >
              {busy ? "..." : "Attack"}
            </button>
          </div>
          {msg ? <p className="text-sm">{msg}</p> : null}
        </div>
      )}
    </main>
  );
}
export default function BossPage() {
  return (
    <Suspense fallback={<main><p>Loading boss...</p></main>}>
      <BossInner />
    </Suspense>
  );
}

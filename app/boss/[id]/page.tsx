"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import katex from "katex";
import { skillName } from "@/lib/graph/skills";
import HpBar from "@/components/HpBar";
import BossAvatar from "@/components/BossAvatar";

type BossView = {
  id: string;
  skill_tag: string;
  current_hp: number;
  max_hp: number;
  status: string;
  despawn_at: string;
  correct_indices: number[];
  verified_count: number;
  questions: Array<{ level: number; prompt_latex: string; hint: string }>;
};

const ATTACK_TIMEOUT_MS = 20000;

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
  const [flash, setFlash] = useState(false);
  const [dmg, setDmg] = useState(0);
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));

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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ATTACK_TIMEOUT_MS);
    try {
      const res = await fetch("/api/boss/" + id + "/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_index: idx % boss.questions.length, answer: n }),
        signal: ctrl.signal,
      });
      const d = await res.json();
      if (res.status === 410) {
        // Boss died or expired mid-fight (possibly in another tab): show the end screen.
        setBoss({ ...boss, status: d.status ?? "EXPIRED" });
        return;
      }
      if (!res.ok) throw new Error(d.error ?? "Attack failed.");
      setBoss({ ...boss, current_hp: d.current_hp, status: d.status });
      if (d.correct) {
        setMsg("Hit! -" + d.damage + " HP");
        setAnswer("");
        setDmg(d.damage);
        setIdx((i) => i + 1);
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      } else {
        setMsg("Miss. Check the hint and try again.");
      }
    } catch (e) {
      setMsg(
        e instanceof DOMException && e.name === "AbortError"
          ? "Attack timed out. Reload to see the latest HP before retrying."
          : e instanceof Error
            ? e.message
            : "Attack failed.",
      );
    } finally {
      clearTimeout(timer);
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
  // Cycle questions so high-HP (World) bosses stay killable after question 5.
  const q = boss.questions[idx % boss.questions.length];
  const pct = Math.max(0, (boss.current_hp / boss.max_hp) * 100);
  const left = new Date(boss.despawn_at).getTime() - now;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Boss: {skillName(boss.skill_tag)}</h1>
        <span className="text-sm tabular-nums text-zinc-500">{fmt(left)}</span>
      </div>
      <div className="relative flex justify-center">
        <div className={flash ? "arena-shake" : ""}>
          <BossAvatar pct={pct} />
        </div>
        {flash && dmg > 0 ? (
          <span key={boss.current_hp} className="arena-damage">
            -{dmg}
          </span>
        ) : null}
      </div>
      <HpBar current={boss.current_hp} max={boss.max_hp} flash={flash} />
      <p className="text-sm text-zinc-600">
        HP {boss.current_hp}/{boss.max_hp} — {boss.status}
      </p>
      <p className="text-xs text-zinc-500">
        ✓ {boss.verified_count}/{boss.questions.length} answers recomputed by a math engine — the AI is
        never trusted with answers.
      </p>
      {boss.status === "DEAD" ? (
        <div className="arena-pop rounded-lg border p-4">
          <p className="text-lg font-semibold">Boss slain. Skill patched.</p>
          <nav className="flex gap-4 text-sm">
            <a href="/arena" className="underline">
              Back to arena
            </a>
            <a href="/scan" className="underline">
              Scan another work
            </a>
          </nav>
        </div>
      ) : boss.status !== "ALIVE" ? (
        <div className="rounded-lg border p-4">
          <p className="text-lg font-semibold">This boss has expired.</p>
          <a href="/scan" className="text-sm underline">
            Scan your work to summon a fresh one
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm text-zinc-500">
            Question {(idx % boss.questions.length) + 1}/{boss.questions.length} — level {q.level}
            {idx >= boss.questions.length ? " — boss still standing, questions loop" : null}
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

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
  const [miss, setMiss] = useState(false);
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
        setMiss(true);
        setTimeout(() => setMiss(false), 500);
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
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
        <div className="arena-shimmer h-40 rounded-2xl" />
        <p className="text-sm text-zinc-500">{msg || "Summoning boss…"}</p>
      </main>
    );
  }
  // Cycle questions so high-HP (World) bosses stay killable after question 5.
  const q = boss.questions[idx % boss.questions.length];
  const pct = Math.max(0, (boss.current_hp / boss.max_hp) * 100);
  const left = new Date(boss.despawn_at).getTime() - now;
  const urgent = left < 60000 && boss.status === "ALIVE";
  const ring = pct <= 0 ? "border-zinc-600" : pct <= 25 ? "border-red-500 shadow-[0_0_36px_rgba(239,68,68,0.5)]" : pct <= 50 ? "border-amber-500/70 shadow-[0_0_28px_rgba(245,158,11,0.35)]" : "border-zinc-700 shadow-[0_0_28px_rgba(239,68,68,0.25)]";
  const msgColor = msg.startsWith("Hit") ? "text-emerald-400 font-semibold" : msg.startsWith("Miss") || msg.startsWith("Enter") ? "text-red-400" : "text-zinc-400";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <div className="arena-enter flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-red-400 uppercase">Boss fight</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{skillName(boss.skill_tag)}</h1>
        </div>
        <span className={`shrink-0 font-mono text-sm tabular-nums ${urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
          {fmt(left)}
        </span>
      </div>
      <div className="arena-enter arena-d1 relative flex justify-center py-2">
        <div className={`rounded-full border-2 bg-zinc-900/80 p-4 transition-all ${ring} ${flash ? "arena-shake" : "arena-float"}`}>
          <BossAvatar pct={pct} />
        </div>
        {flash && dmg > 0 ? (
          <span key={boss.current_hp} className="arena-damage">
            -{dmg}
          </span>
        ) : null}
      </div>
      <div className="arena-enter arena-d1">
        <HpBar current={boss.current_hp} max={boss.max_hp} flash={flash} />
        <div className="mt-1 flex items-baseline justify-between text-sm">
          <p className="text-zinc-400">
            HP {boss.current_hp}/{boss.max_hp} — {boss.status}
          </p>
          <p className="text-xs text-zinc-500">
            ✓ {boss.verified_count}/{boss.questions.length} machine-verified
          </p>
        </div>
      </div>
      {boss.status === "DEAD" ? (
        <div className="arena-pop arena-card relative overflow-hidden rounded-2xl p-8 text-center">
          <div className="arena-rays" aria-hidden="true" />
          <div className="relative">
            <p className="text-3xl">🏆</p>
            <p className="arena-title mt-2 text-2xl font-black">Boss slain.</p>
            <p className="mt-1 text-sm text-zinc-400">Skill patched. The root cause is closed.</p>
            <nav className="mt-4 flex justify-center gap-3 text-sm">
              <a href="/arena" className="arena-btn-primary rounded-full px-5 py-2 font-semibold text-white">
                Back to arena
              </a>
              <a href="/scan" className="arena-btn-ghost rounded-full px-5 py-2 font-medium text-zinc-200">
                Scan another work
              </a>
            </nav>
          </div>
        </div>
      ) : boss.status !== "ALIVE" ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p className="text-lg font-bold">This boss has expired.</p>
          <a href="/scan" className="arena-btn-ghost mt-3 inline-block rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
            Scan your work to summon a fresh one
          </a>
        </div>
      ) : (
        <div className={`arena-enter arena-d2 arena-card flex flex-col gap-3 rounded-2xl p-5 ${miss ? "arena-shake border-red-800" : ""}`}>
          <p className="text-sm text-zinc-400">
            Question {(idx % boss.questions.length) + 1}/{boss.questions.length} —{" "}
            <span className="font-bold text-amber-300">level {q.level}</span>
            {idx >= boss.questions.length ? " — boss still standing, questions loop" : null}
          </p>
          <div
            className="overflow-x-auto text-xl text-zinc-100"
            dangerouslySetInnerHTML={{ __html: katex.renderToString(q.prompt_latex, { throwOnError: false }) }}
          />
          <p className="text-sm text-zinc-400">💡 Hint: {q.hint}</p>
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
              className="arena-input min-w-0 flex-1 rounded-xl px-4 py-2.5 text-zinc-100 placeholder:text-zinc-600"
            />
            <button
              onClick={attack}
              disabled={busy}
              className="arena-btn-primary shrink-0 rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "…" : "⚔ Attack"}
            </button>
          </div>
          {msg ? <p className={`text-sm ${msgColor}`}>{msg}</p> : null}
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
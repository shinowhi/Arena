"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import MathText from "@/components/MathText";
import PageHeader from "@/components/ui/PageHeader";
import { skillName } from "@/lib/graph/skills";
import HpBar from "@/components/HpBar";
import BossAvatar from "@/components/BossAvatar";
import BossIntro from "@/components/BossIntro";
import RaidFeed from "@/components/RaidFeed";
import ShareCard from "@/components/ShareCard";
import CharRig from "@/components/CharRig";
import { DEFAULT_AVATAR, loadAvatar, skillOf, type AvatarSpec } from "@/lib/game/avatar";
import { createClient } from "@/lib/supabase/client";

type BossView = {
  id: string;
  skill_tag: string;
  current_hp: number;
  max_hp: number;
  status: string;
  despawn_at: string;
  rarity: string;
  correct_indices: number[];
  verified_count: number;
  questions: Array<{ level: number; prompt_latex: string; hint: string }>;
};

const ATTACK_TIMEOUT_MS = 20000;

// A5: Web Audio sound effects, zero audio files. The context is created lazily
// on the first attack click, so browser autoplay policies stay happy.
let audioCtx: AudioContext | null = null;
function soundCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}
function tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
  const ac = soundCtx();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ac.currentTime + at);
  g.gain.exponentialRampToValueAtTime(vol, ac.currentTime + at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + dur);
  o.connect(g);
  g.connect(ac.destination);
  o.start(ac.currentTime + at);
  o.stop(ac.currentTime + at + dur + 0.05);
}
function speak(text: string, muted: boolean) {
  if (muted || typeof window === "undefined") return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 0.7;
    synth.speak(u);
  } catch {
    // Speech unsupported: the fight works fine silent.
  }
}
function playSound(kind: "hit" | "miss" | "victory", muted: boolean) {
  if (muted || typeof window === "undefined") return;
  if (kind === "hit") {
    tone(320, 0, 0.12, "sawtooth", 0.1);
    tone(640, 0.05, 0.15, "square", 0.06);
  } else if (kind === "miss") {
    tone(140, 0, 0.2, "sine", 0.14);
  } else {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, "triangle", 0.1));
  }
}

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
  const search = useSearchParams();
  const rootParam = search.get("root") ?? "";
  const isRevenge = search.get("revenge") === "1";
  const [boss, setBoss] = useState<BossView | null>(null);
  const isGauntlet = search.get("gauntlet") === "1" || boss?.skill_tag === "gauntlet";
  const bossName = !boss ? "" : isGauntlet ? "Mixed Gauntlet" : skillName(boss.skill_tag);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [flash, setFlash] = useState(false);
  const [miss, setMiss] = useState(false);
  const [dmg, setDmg] = useState(0);
  const [combo, setCombo] = useState(0);
  const [t0, setT0] = useState(0);
  const [intro, setIntro] = useState(false);
  const [copiedWin, setCopiedWin] = useState(false);
  const [taunt, setTaunt] = useState("");
  const tauntKey = useRef("");
  const [tutor, setTutor] = useState({ loading: false, text: "" });

  async function askWhy() {
    if (!boss || tutor.loading) return;
    if (answer.trim() === "") return;
    const n = Number(answer);
    if (!Number.isFinite(n)) return;
    setTutor({ loading: true, text: "" });
    try {
      const r = await fetch("/api/tutor/mistake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boss_id: id, question_index: idx % boss.questions.length, wrong_answer: n }),
      });
      const d = (await r.json()) as { nudge?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Tutor failed.");
      setTutor({ loading: false, text: d.nudge ?? "" });
    } catch {
      setTutor({ loading: false, text: "Tutor failed — retry." });
    }
  }

  async function copyWin() {
    if (!boss) return;
    const comboBit = combo >= 2 ? ` with a x${combo} combo` : "";
    const timeBit = t0 > 0 ? ` in ${fmt(Date.now() - t0)}` : "";
    const text =
      `I slayed the ${bossName} boss in Arena${comboBit}${timeBit} — ` +
      `5 machine-verified questions down. Think you can? ${window.location.origin}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy your victory:", text);
      return;
    }
    setCopiedWin(true);
    setTimeout(() => setCopiedWin(false), 2000);
  }
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem("arena_muted") === "1";
    } catch {
      return false;
    }
  });

  function toggleMute() {
    const next = !muted;
    try {
      localStorage.setItem("arena_muted", next ? "1" : "0");
    } catch {
      // Private mode: mute still works for this session.
    }
    setMuted(next);
  }
  const [avatar, setAvatar] = useState<AvatarSpec>(DEFAULT_AVATAR);
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));

  useEffect(() => {
    fetch("/api/boss/" + id)
      .then(async (r) => {
        const d = (await r.json()) as BossView & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        setBoss(d);
        setT0(Date.now());
        const done = new Set<number>(d.correct_indices);
        let i = 0;
        while (i < d.questions.length && done.has(i)) i++;
        setIdx(i);
        if (d.status === "ALIVE" && done.size === 0) {
          setIntro(true);
          setTimeout(() => setIntro(false), 3000);
          let m = false;
          try {
            m = localStorage.getItem("arena_muted") === "1";
          } catch {
            m = false;
          }
          speak(`I am ${d.skill_tag === "gauntlet" ? "Mixed Gauntlet" : skillName(d.skill_tag)}. Answer my five questions, if you can.`, m);
        }
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "Load failed."));
  }, [id]);
  useEffect(() => {
    // Client-only read after hydration; microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => setAvatar(loadAvatar()));
  }, []);

  // Shared-HP sync: anyone's hit updates every open fight screen live
  // (previously only the attacker's screen moved). Merges HP + status
  // only; each player's question/answer progress stays local.
  useEffect(() => {
    let stop = false;
    const supabase = createClient();
    const ch = supabase
      .channel("boss-hp-" + id)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bosses", filter: `id=eq.${id}` },
        (payload) => {
          if (stop) return;
          const row = payload.new as { current_hp?: unknown; status?: unknown } | undefined;
          const hp = row?.current_hp;
          if (typeof hp !== "number") return;
          const status = typeof row?.status === "string" ? row.status : undefined;
          setBoss((prev) =>
            prev && (prev.current_hp !== hp || (status !== undefined && prev.status !== status))
              ? { ...prev, current_hp: hp, status: status ?? prev.status }
              : prev,
          );
        },
      )
      .subscribe();
    return () => {
      stop = true;
      supabase.removeChannel(ch);
    };
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Boss trash-talk bubble: fetched once per fight state (load + transitions).
  useEffect(() => {
    if (!boss) return;
    const key = boss.id + ":" + boss.status;
    if (tauntKey.current === key) return;
    tauntKey.current = key;
    let stop = false;
    fetch("/api/boss/taunt?id=" + id)
      .then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as { taunt?: string };
        if (!stop && typeof d.taunt === "string") setTaunt(d.taunt);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [boss, id]);

  async function attack() {
    if (!boss || busy || boss.status !== "ALIVE") return;
    // Number("") is 0: blank input must never attack as zero.
    if (answer.trim() === "") {
      setMsg("Enter a number.");
      return;
    }
    const n = Number(answer);
    if (!Number.isFinite(n)) {
      setMsg("Enter a number.");
      return;
    }
    setBusy(true);
    setMsg("");
    setTutor({ loading: false, text: "" });
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
        setMsg("Hit! " + skillOf(avatar.species).skill + " -" + d.damage + " HP");
        setAnswer("");
        setDmg(d.damage);
        setCombo((c) => c + 1);
        setIdx((i) => i + 1);
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
        playSound(d.status === "DEAD" ? "victory" : "hit", muted);
      } else {
        setMsg("Miss. Check the hint and try again.");
        setCombo(0);
        setMiss(true);
        setTimeout(() => setMiss(false), 500);
        playSound("miss", muted);
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
      {intro && boss.status === "ALIVE" ? (
        <BossIntro name={bossName} onSkip={() => setIntro(false)} />
      ) : null}
      <PageHeader
        kicker="Boss fight"
        title={bossName}
        right={
          <span className={`shrink-0 font-mono text-sm tabular-nums ${urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
            {fmt(left)}
          </span>
        }
      />
      {taunt ? (
        <p className="arena-enter rounded-2xl border border-violet-500/40 bg-violet-950/30 px-4 py-2 text-center text-sm text-violet-200 italic">
          “{taunt}”
        </p>
      ) : null}
      {isRevenge ? (
        <div className="arena-enter rounded-2xl bg-red-950/40 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-red-300 uppercase">Revenge boss</p>
          <p className="mt-1 text-sm text-zinc-300">
            Fresh questions on {skillName(boss.skill_tag)} — avoids your recent ones.
          </p>
        </div>
      ) : null}
      {isGauntlet ? (
        <div className="arena-enter rounded-2xl bg-amber-950/40 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-amber-300 uppercase">Gauntlet run</p>
          <p className="mt-1 text-sm text-zinc-300">
            Five skills, one boss — each level tests a different gap.
          </p>
        </div>
      ) : null}
      <div className="arena-enter arena-d1 arena-battleground relative overflow-hidden rounded-2xl border border-zinc-800 px-4 pt-4 pb-6">
        <div className="flex items-end justify-between gap-2">
          <div className={flash ? "arena-lunge" : "arena-float"}>
            <CharRig spec={avatar} size={144} attacking={flash} />
          </div>
          <div className={`overflow-hidden rounded-full border-2 bg-zinc-900/80 p-3 transition-all ${ring} ${flash ? "arena-shake" : "arena-float"}`}>
            <BossAvatar pct={pct} rarity={boss.rarity} size={104} />
          </div>
        </div>
        {flash ? (
          <span
            key={boss.current_hp}
            className="arena-bolt"
            style={{ background: skillOf(avatar.species).bolt, boxShadow: `0 0 16px ${skillOf(avatar.species).bolt}` }}
          />
        ) : null}
        {flash && dmg > 0 ? (
          <span key={"dmg" + boss.current_hp} className="arena-damage right-6">
            -{dmg}
          </span>
        ) : null}
        {flash ? (
          <span key={"ring" + boss.current_hp} className="pointer-events-none absolute inset-0 flex items-center justify-end pr-8">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="absolute h-28 w-28 animate-ping rounded-full border-2 border-red-400"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        ) : null}
      </div>
      {rootParam !== "" && rootParam !== boss.skill_tag ? (
        <div className="arena-enter rounded-2xl border border-cyan-500/50 bg-cyan-950/40 p-4 text-center">
          <p className="text-xs font-bold tracking-widest text-cyan-300 uppercase">Time portal open</p>
          <p className="mt-1 text-sm text-zinc-300">
            This {skillName(boss.skill_tag)} boss is rooted in{" "}
            <span className="font-bold text-cyan-200">{skillName(rootParam)}</span> — patch the past to
            fix the present.
          </p>
        </div>
      ) : null}
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
      <RaidFeed bossId={boss.id} />
      {boss.status === "DEAD" ? (
        <div className="arena-pop arena-card relative overflow-hidden rounded-2xl p-8 text-center">
          <div className="arena-rays" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {["left-6 top-6", "right-6 top-10", "left-10 bottom-8", "right-10 bottom-10"].map((pos, i) => (
              <span
                key={pos}
                className={`absolute h-10 w-10 animate-ping rounded-full border-2 border-amber-300 [animation-iteration-count:4] ${pos}`}
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
          <div className="relative">
            <p className="text-3xl" aria-hidden="true">🏆</p>
            <p className="arena-title font-display mt-2 text-3xl font-black">Boss slain.</p>
            <p className="mt-1 text-sm text-zinc-400">Skill patched. The root cause is closed.</p>
            {t0 > 0 ? <p className="mt-1 text-sm text-zinc-500">Slain in {fmt(now - t0)}</p> : null}
            <nav className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
              <Link href="/arena" className="arena-btn-primary rounded-full px-5 py-2 font-semibold text-white">
                Back to arena
              </Link>
              <Link href="/scan" className="arena-btn-ghost rounded-full px-5 py-2 font-medium text-zinc-200">
                Scan more work
              </Link>
              <Link href="/revenge" className="arena-btn-ghost rounded-full px-5 py-2 font-medium text-zinc-200">
                Challenge revenge boss
              </Link>
              <Link href="/badges" className="arena-btn-ghost rounded-full px-5 py-2 font-medium text-zinc-200">
                Weekly badges
              </Link>
              <Link href="/gauntlet" className="arena-btn-ghost rounded-full px-5 py-2 font-medium text-zinc-200">
                Gauntlet boss
              </Link>
              <button
                type="button"
                onClick={copyWin}
                className="arena-btn-ghost rounded-full px-5 py-2 font-medium text-zinc-200"
              >
                {copiedWin ? "Copied!" : "Copy result"}
              </button>
              <ShareCard
                kicker="Arena victory"
                title={`${bossName} boss slain`}
                stats={[
                  `${boss.questions.length} questions conquered`,
                  t0 > 0 ? `Slain in ${fmt(now - t0)}` : "Victory",
                  "Answers machine-verified",
                ]}
              />
            </nav>
          </div>
        </div>
      ) : boss.status !== "ALIVE" ? (
        <div className="arena-card rounded-2xl p-6 text-center">
          <p className="text-lg font-bold">This boss has expired.</p>
          <Link href="/scan" className="arena-btn-ghost mt-3 inline-block rounded-full px-5 py-2 text-sm font-medium text-zinc-200">
            Scan your work to summon a fresh one
          </Link>
        </div>
      ) : (
        <div className={`arena-enter arena-d2 arena-card flex flex-col gap-3 rounded-2xl p-5 ${miss ? "arena-shake border-red-800" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex gap-1" aria-hidden="true">
                {boss.questions.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-5 rounded-full ${i === idx % boss.questions.length ? "bg-amber-400" : i < idx % boss.questions.length && idx < boss.questions.length ? "bg-emerald-500" : "bg-zinc-700"}`}
                  />
                ))}
              </div>
              <p className="arena-num text-sm text-zinc-400">
                {(idx % boss.questions.length) + 1}/{boss.questions.length} ·{" "}
                <span className="font-bold text-amber-300">Lv {q.level}</span>
                {idx >= boss.questions.length ? " · looping" : null}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
              className="shrink-0 rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800"
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
          </div>
          <MathText text={q.prompt_latex} className="overflow-x-auto text-xl text-zinc-100" />
          <p className="text-sm text-zinc-400"><span aria-hidden="true">💡</span> Hint: {q.hint}</p>
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
              aria-label="Your numeric answer"
              className="arena-input arena-num min-w-0 flex-1 rounded-xl px-4 py-2.5 text-lg text-zinc-100 placeholder:text-zinc-600"
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
          {msg.startsWith("Miss") ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={askWhy}
                disabled={tutor.loading}
                className="arena-btn-ghost w-fit rounded-full px-4 py-1.5 text-sm font-medium text-zinc-200 disabled:opacity-40"
              >
                {tutor.loading ? "Thinking…" : "Why was I wrong?"}
              </button>
              {tutor.text ? (
                <p className="rounded-xl bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">{tutor.text}</p>
              ) : null}
            </div>
          ) : null}
          {combo >= 2 ? (
            <p key={combo} className="arena-pop font-display inline-block w-fit rounded-lg bg-amber-500/15 px-3 py-1 text-lg font-extrabold text-amber-300">
              Combo ×{combo}
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
export default function BossPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl px-4 py-8"><p className="text-zinc-500">Loading boss…</p></main>}>
      <BossInner />
    </Suspense>
  );
}

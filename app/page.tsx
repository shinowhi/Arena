import Link from "next/link";
import StreakBadge from "@/components/StreakBadge";
import ScanHistory from "@/components/ScanHistory";
import PageHeader from "@/components/ui/PageHeader";

const STEPS = [
  { n: "01", t: "Scan", d: "Snap your exam, screenshot, or real life. Vision AI reads it directly — no OCR." },
  { n: "02", t: "Diagnose", d: "Your mistake is mapped onto the skill graph — calculus to mechanics — and traced to its root cause." },
  { n: "03", t: "Slay", d: "Fight a boss of 5 isomorphic questions. Every answer is recomputed by a math engine." },
];

const SPOTLIGHT = [
  { e: "📸", t: "Scan", d: "Exam, screenshot, or real life. Vision AI reads it directly — no OCR.", href: "/scan", cta: "Scan now", dl: "arena-d1", accent: "hover:border-cyan-400/70 hover:shadow-[0_0_36px_rgba(34,211,238,0.3)]", glow: "text-cyan-300" },
  { e: "⚔️", t: "Boss fight", d: "Your weakest skill, alive. Five questions stand between you and the kill.", href: "/arena", cta: "Enter arena", dl: "arena-d2", accent: "hover:border-red-500/70 hover:shadow-[0_0_36px_rgba(239,68,68,0.35)]", glow: "text-red-400" },
  { e: "🌍", t: "Real life", d: "Snap anything around you — get a solvable problem from the scene.", href: "/scan?mode=life", cta: "Try it", dl: "arena-d3", accent: "hover:border-emerald-400/70 hover:shadow-[0_0_36px_rgba(52,211,153,0.3)]", glow: "text-emerald-300" },
  { e: "👻", t: "Ghost classroom", d: "Anonymous hunters grinding beside you tonight. Never study alone.", href: "/ghosts", cta: "Join them", dl: "arena-d4", accent: "hover:border-violet-400/70 hover:shadow-[0_0_36px_rgba(167,139,250,0.3)]", glow: "text-violet-300" },
];

const MORE = [
  { t: "Healing streak", href: "/streak" },
  { t: "Root diary", href: "/diary" },
  { t: "Exam countdown", href: "/countdown" },
  { t: "Formula cards", href: "/cards" },
  { t: "30-day roadmap", href: "/roadmap" },
  { t: "Night market", href: "/market" },
  { t: "Parent report", href: "/parent" },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <StreakBadge />
      <header className="mx-auto flex w-full max-w-5xl items-center gap-2 py-4 pl-4 pr-14 text-sm sm:pr-32">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
        <span className="font-bold tracking-wide">ARENA</span>
        <nav className="ml-auto flex gap-4 text-zinc-400" aria-label="Primary">
          <Link href="/scan" className="font-semibold text-white transition-colors hover:text-cyan-300">Scan</Link>
          <Link href="/arena" className="transition-colors hover:text-white">Arena</Link>
          <Link href="/graph" className="transition-colors hover:text-white">Skills</Link>
          <Link href="/friends" className="transition-colors hover:text-white">Friends</Link>
        </nav>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <p className="arena-enter rounded-full border border-zinc-700 bg-zinc-900/70 px-4 py-1 text-xs font-medium tracking-widest text-zinc-300 uppercase">
          Snap anything · Slay the boss inside
        </p>
        <h1 className="arena-enter arena-d1 font-display text-5xl font-black tracking-tight text-balance sm:text-6xl">
          Scan anything.
          <br />
          <span className="arena-title">Slay the boss.</span>
        </h1>
        <p className="arena-enter arena-d2 max-w-xl text-zinc-400">
          Snap your exam, a screenshot, or anything around you. Arena finds the weak skill hiding behind it — and its root cause two chapters
          back — then spawns a boss to patch it for good.
        </p>
        <nav className="arena-enter arena-d3 flex w-full flex-col gap-3 text-sm sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center" aria-label="Get started">
          <Link href="/scan" className="arena-btn-primary rounded-full px-7 py-3 text-center font-semibold text-white">
            Scan your work
          </Link>
          <Link href="/scan?capture=screen" className="arena-btn-ghost rounded-full px-7 py-3 text-center font-semibold text-zinc-200">
            Capture screen
          </Link>
          <Link href="/scan?mode=life" className="arena-btn-ghost rounded-full px-7 py-3 text-center font-semibold text-zinc-200">
            Snap real life
          </Link>
        </nav>
        <div className="grid w-full gap-3 pt-6 text-left sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className={`arena-enter arena-card rounded-2xl p-5 ${i === 1 ? "arena-d2" : i === 2 ? "arena-d3" : "arena-d1"}`}>
              <p className="arena-kicker">{s.n}</p>
              <p className="font-display mt-1 text-lg font-bold">{s.t}</p>
              <p className="mt-1 text-sm text-zinc-400">{s.d}</p>
            </div>
          ))}
        </div>
        <ScanHistory />
        <div className="w-full pt-10 text-left">
          <PageHeader kicker="Spotlight" title="Pick your battle" sub="Four doors, no wrong choice." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SPOTLIGHT.map((f) => (
              <Link
                key={f.t}
                href={f.href}
                className={
                  "arena-enter arena-card group block rounded-2xl p-5 transition-all hover:-translate-y-1 " +
                  f.dl +
                  " " +
                  f.accent
                }
              >
                <span className="block text-4xl" aria-hidden="true">
                  {f.e}
                </span>
                <span className="mt-3 block">
                  <span className="font-display block text-xl font-black">{f.t}</span>
                  <span className="mt-1 block text-sm text-zinc-400">{f.d}</span>
                  <span className={"mt-2 block text-sm font-bold " + f.glow}>{f.cta} →</span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-8 text-xs font-bold tracking-widest text-zinc-500">MORE ARSENAL</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MORE.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="arena-btn-ghost rounded-full px-4 py-2 text-sm font-medium text-zinc-300 transition-transform hover:-translate-y-0.5"
              >
                {m.t} →
              </Link>
            ))}
          </div>
        </div>
      </section>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-center text-xs text-zinc-600">
        Boss answers are machine-verified — the AI is never trusted with answers.
      </footer>
    </main>
  );
}
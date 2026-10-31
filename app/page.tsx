const STEPS = [
  { n: "01", t: "Scan", d: "Snap a photo of your math work. Vision AI reads the handwriting directly — no OCR." },
  { n: "02", t: "Diagnose", d: "Your mistake is mapped onto a 36-skill graph and traced to its root cause." },
  { n: "03", t: "Slay", d: "Fight a boss of 5 isomorphic questions. Every answer is recomputed by a math engine." },
];

const FEATURES = [
  { t: "Healing streak", d: "Days count when you solve or scan. GitHub-style heatmap.", href: "/streak" },
  { t: "Root diary", d: "Every skill you slew — fails, dates, flawless wins.", href: "/diary" },
  { t: "Exam countdown", d: "Weakest-first battle plan before exam day.", href: "/countdown" },
  { t: "Formula cards", d: "Spaced-repetition cards unlocked by slain bosses.", href: "/cards" },
  { t: "Real-life problems", d: "Snap anything — get a solvable problem from the scene.", href: "/scan" },
  { t: "Ghost classroom", d: "Anonymous hunters grinding beside you tonight.", href: "/ghosts" },
  { t: "30-day roadmap", d: "One focus a day, weakest first. Check in daily.", href: "/roadmap" },
  { t: "Night market", d: "Post XP bounties — or solve others' for XP.", href: "/market" },
  { t: "Parent report", d: "One-time code links a parent to progress numbers.", href: "/parent" },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">

      <header className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 py-4 text-sm">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
        <span className="font-bold tracking-wide">ARENA</span>
        <nav className="ml-auto flex gap-4 text-zinc-400">
          <a href="/arena" className="transition-colors hover:text-white">Arena</a>
          <a href="/scan" className="transition-colors hover:text-white">Scan</a>
          <a href="/graph" className="transition-colors hover:text-white">Skills</a>
        </nav>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <p className="arena-enter rounded-full border border-zinc-700 bg-zinc-900/70 px-4 py-1 text-xs font-medium tracking-widest text-zinc-300 uppercase">
          Find the hole · Patch it with a game
        </p>
        <h1 className="arena-enter arena-d1 text-5xl font-black tracking-tight text-balance sm:text-6xl">
          Scan your work.
          <br />
          <span className="arena-title">Slay the boss.</span>
        </h1>
        <p className="arena-enter arena-d2 max-w-xl text-zinc-400">
          Arena finds the weak skill hiding behind your wrong answers — and its root cause two chapters
          back — then spawns a boss to patch it for good.
        </p>
        <nav className="arena-enter arena-d3 flex flex-wrap justify-center gap-3 text-sm">
          <a href="/scan" className="arena-btn-primary rounded-full px-7 py-3 font-semibold text-white">
            Scan your work
          </a>
          <a href="/arena" className="arena-btn-ghost rounded-full px-7 py-3 font-semibold text-zinc-200">
            Enter arena
          </a>
        </nav>
        <div className="grid w-full gap-3 pt-6 text-left sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className={`arena-enter arena-card rounded-2xl p-5 ${i === 1 ? "arena-d2" : i === 2 ? "arena-d3" : "arena-d1"}`}>
              <p className="text-xs font-bold tracking-widest text-red-400">{s.n}</p>
              <p className="mt-1 text-lg font-bold">{s.t}</p>
              <p className="mt-1 text-sm text-zinc-400">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="w-full pt-10 text-left">
          <p className="text-xs font-bold tracking-widest text-red-400">04</p>
          <p className="mt-1 text-lg font-bold">Beyond the boss</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <a key={f.href + f.t} href={f.href} className="arena-card block rounded-2xl p-5 transition-transform hover:-translate-y-0.5">
                <p className="font-bold">{f.t}</p>
                <p className="mt-1 text-sm text-zinc-400">{f.d}</p>
                <p className="mt-2 text-xs font-semibold text-red-400">Open →</p>
              </a>
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
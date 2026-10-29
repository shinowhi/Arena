export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Scan it. Find the hole. Slay it.
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Arena</h1>
        <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
          A red X never tells you <em>why</em>. Photograph your math work, let AI trace the mistake to
          its root cause, then fight a boss of 5 machine-verified questions to patch the skill.
        </p>
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        <a href="/scan" className="rounded-full bg-zinc-900 px-6 py-2.5 font-medium text-white">
          Scan work
        </a>
        <a href="/arena" className="rounded-full border px-6 py-2.5 font-medium">
          Enter arena
        </a>
        <a href="/graph" className="rounded-full border px-6 py-2.5 font-medium">
          Skill graph
        </a>
      </nav>
      <ol className="grid w-full gap-3 text-left sm:grid-cols-3">
        <li className="rounded-lg border p-4">
          <p className="text-2xl font-bold text-zinc-300">1</p>
          <p className="font-semibold">Scan</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Upload a photo of handwritten math. Vision AI reads it directly — no OCR.
          </p>
        </li>
        <li className="rounded-lg border p-4">
          <p className="text-2xl font-bold text-zinc-300">2</p>
          <p className="font-semibold">Diagnose</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your mistake is mapped onto a 36-skill graph to find the weak skill and its root cause.
          </p>
        </li>
        <li className="rounded-lg border p-4">
          <p className="text-2xl font-bold text-zinc-300">3</p>
          <p className="font-semibold">Slay</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Fight 5 isomorphic questions — same shape, new numbers. Every answer recomputed by a math
            engine before the boss exists.
          </p>
        </li>
      </ol>
      <p className="max-w-xl text-xs text-zinc-500">
        3 agents (vision → gap finder → boss generator) on Muse Spark 1.3 via the Meta Model API.
        Answers are never trusted from the AI — only from math.
      </p>
    </main>
  );
}

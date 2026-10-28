export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-3xl font-bold tracking-tight">Arena (working title)</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Scan your math work, find the weak skill and its root cause, then slay a boss of 5 verified questions.
      </p>
      <nav className="flex gap-3 text-sm">
        <a href="/arena" className="rounded-full bg-zinc-900 px-5 py-2.5 font-medium text-white">
          Enter arena
        </a>
        <a href="/scan" className="rounded-full border px-5 py-2.5 font-medium">
          Scan work
        </a>
      </nav>
    </main>
  );
}

import Link from "next/link";

// The night market is taking a break: posting and claiming are paused while
// we focus on the learning core. The page stays up (routes and nav untouched)
// with pointers to where the action is.
export default function MarketPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Night market</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">Taking a break</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        The bounty market is paused for now — too quiet to be fun. Your XP and past bounties are
        safe. Meanwhile, the best way to earn is the old-fashioned way: scan a problem, slay the
        boss, and climb the exams.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/scan"
          className="inline-flex min-h-[48px] items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
        >
          Scan a problem
        </Link>
        <Link
          href="/exam"
          className="inline-flex min-h-[48px] items-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
        >
          Take a mock exam
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";

// Exam mocks strip (B-owned): sits above game content on the homepage.
const EXAMS = [
  { t: "V-ACT", d: "120 questions", href: "/vact" },
  { t: "HSA", d: "150 questions", href: "/hsa" },
  { t: "THPT", d: "90-minute mock", href: "/thpt" },
];

export default function ExamStrip() {
  return (
    <section aria-label="Exam mocks" className="arena-enter w-full text-left">
      <p className="arena-kicker">Exam mocks</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {EXAMS.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="arena-card group flex min-h-[48px] items-center justify-between gap-2 rounded-2xl px-4 py-3 transition-all hover:-translate-y-0.5"
          >
            <span>
              <span className="font-display block text-lg font-extrabold text-zinc-100">
                {e.t}
              </span>
              <span className="block text-xs text-zinc-400">{e.d} · machine-graded</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-sm font-bold text-cyan-300">
              Start →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

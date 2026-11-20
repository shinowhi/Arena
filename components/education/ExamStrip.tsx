import Link from "next/link";

// Exam mocks strip (B-owned): sits above game content on the homepage.
const EXAMS = [
  { t: "V-ACT", d: "120 câu hỏi", href: "/vact" },
  { t: "HSA", d: "150 câu hỏi", href: "/hsa" },
  { t: "THPT", d: "Thi thử 90 phút", href: "/thpt" },
];

export default function ExamStrip() {
  return (
    <section aria-label="Thi thử" className="arena-enter w-full text-left">
      <p className="arena-kicker">Thi thử</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {EXAMS.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            className="arena-card group flex min-h-[48px] items-center justify-between gap-2 rounded-2xl px-4 py-3 transition-[transform,border-color] hover:-translate-y-0.5"
          >
            <span>
              <span className="font-display block text-lg font-extrabold text-zinc-100">
                {e.t}
              </span>
              <span className="block text-xs text-zinc-400">{e.d} — máy chấm điểm</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-sm font-bold text-cyan-300">
              Bắt đầu →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

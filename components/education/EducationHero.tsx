import Link from "next/link";

// Education-first entry (B-owned): one headline, one primary CTA.
export default function EducationHero() {
  return (
    <section
      aria-label="Start learning"
      className="arena-enter arena-card w-full rounded-2xl p-6 text-center sm:p-8"
    >
      <p className="arena-kicker">60-second start</p>
      <h2 className="font-display mt-2 text-2xl font-black tracking-tight text-balance sm:text-3xl">
        Scan homework → find weak skills → drill them
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        Snap one homework photo. Arena spots the exact skill holding you back —
        then turns it into a boss you can beat.
      </p>
      <div className="mt-4 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/scan?sample=1"
          className="arena-btn-primary inline-flex min-h-[48px] items-center justify-center rounded-full px-7 py-3 text-center font-semibold text-white"
        >
          Try a sample scan
        </Link>
        <Link
          href="/scan"
          className="arena-btn-ghost inline-flex min-h-[48px] items-center justify-center rounded-full px-7 py-3 text-center font-semibold text-zinc-200"
        >
          Scan my homework
        </Link>
      </div>
    </section>
  );
}

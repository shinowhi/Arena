// Mobile sticky exam clock: header timers scroll away on phones, so exam
// pages render this pinned duplicate near the top on small screens only.
export default function StickyTimer({
  show,
  label,
  text,
  tone,
}: {
  show: boolean;
  label: string;
  text: string;
  tone: "normal" | "urgent" | "expired";
}) {
  if (!show) return null;
  const color =
    tone === "expired"
      ? "font-bold text-red-400"
      : tone === "urgent"
        ? "arena-urgent font-bold"
        : "text-zinc-300";
  return (
    <div className="sticky top-2 z-20 sm:hidden">
      <p
        role="timer"
        aria-label={label + " (pinned)"}
        className={`mx-auto w-fit rounded-full border border-zinc-700 bg-zinc-950/95 px-4 py-2 font-mono text-sm font-bold tabular-nums ${color}`}
      >
        {text}
      </p>
    </div>
  );
}

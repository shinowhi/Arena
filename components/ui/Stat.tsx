// Shared stat tile: big display number + small label. Numbers use tabular figures.
export default function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "gold" | "red" | "green" | "cyan";
}) {
  const color =
    accent === "red"
      ? "text-red-300"
      : accent === "green"
        ? "text-emerald-300"
        : accent === "cyan"
          ? "text-cyan-300"
          : "text-amber-300";
  return (
    <div className="arena-card rounded-xl px-4 py-3 text-center">
      <p className={`font-display arena-num text-3xl font-extrabold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{label}</p>
    </div>
  );
}

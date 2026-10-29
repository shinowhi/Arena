export default function HpBar({
  current,
  max,
  flash = false,
}: {
  current: number;
  max: number;
  flash?: boolean;
}) {
  const pct = Math.max(0, (current / max) * 100);
  const color = pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={`h-4 overflow-hidden rounded-full bg-zinc-200 ${flash ? "arena-hitflash" : ""}`}>
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

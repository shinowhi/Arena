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
  const fill =
    pct > 50
      ? "from-emerald-400 to-emerald-600 shadow-[0_0_12px_rgba(52,211,153,0.7)]"
      : pct > 25
        ? "from-amber-300 to-amber-600 shadow-[0_0_12px_rgba(251,191,36,0.7)]"
        : "from-red-400 to-red-700 shadow-[0_0_12px_rgba(239,68,68,0.8)]";
  return (
    <div className={`h-4 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 ${flash ? "arena-hitflash" : ""}`}>
      <div className={`h-full bg-gradient-to-r ${fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}
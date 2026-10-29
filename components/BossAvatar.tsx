// CSS/SVG boss: healthy -> hurt -> dead based on remaining HP. No assets, no deps.
export default function BossAvatar({ pct }: { pct: number }) {
  const dead = pct <= 0;
  const hurt = !dead && pct <= 50;
  const body = dead ? "#a1a1aa" : hurt ? "#b91c1c" : "#ef4444";
  const belly = dead ? "#d4d4d8" : hurt ? "#7f1d1d" : "#fca5a5";
  const horn = dead ? "#71717a" : "#7f1d1d";
  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      role="img"
      aria-label={dead ? "slain boss" : hurt ? "hurt boss" : "boss"}
    >
      <path d="M22 30 L14 12 L32 22 Z" fill={horn} />
      <path d="M74 30 L82 12 L64 22 Z" fill={horn} />
      <ellipse cx="48" cy="54" rx="34" ry="30" fill={body} />
      <ellipse cx="48" cy="66" rx="20" ry="14" fill={belly} opacity="0.55" />
      {dead ? (
        <g stroke="#18181b" strokeWidth="4" strokeLinecap="round">
          <line x1="30" y1="44" x2="42" y2="56" />
          <line x1="42" y1="44" x2="30" y2="56" />
          <line x1="54" y1="44" x2="66" y2="56" />
          <line x1="66" y1="44" x2="54" y2="56" />
        </g>
      ) : (
        <g>
          <circle cx="36" cy="50" r="7" fill="#fff" />
          <circle cx="60" cy="50" r="7" fill="#fff" />
          <circle cx={hurt ? 36 : 38} cy="51" r="3" fill="#18181b" />
          <circle cx={hurt ? 60 : 62} cy="51" r="3" fill="#18181b" />
        </g>
      )}
      {dead ? (
        <line x1="38" y1="72" x2="58" y2="72" stroke="#18181b" strokeWidth="3" strokeLinecap="round" />
      ) : hurt ? (
        <path d="M38 74 Q48 68 58 74" stroke="#18181b" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M36 68 Q48 78 60 68" stroke="#18181b" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

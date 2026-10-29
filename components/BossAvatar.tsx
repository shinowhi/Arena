import { useId } from "react";

// CSS/SVG boss: body color by rarity, mood by remaining HP. No assets, no deps.
const PALETTE: Record<string, { body: string; dark: string; belly: string; horn: string }> = {
  COMMON: { body: "#ef4444", dark: "#7f1d1d", belly: "#fca5a5", horn: "#7f1d1d" },
  ELITE: { body: "#8b5cf6", dark: "#4c1d95", belly: "#c4b5fd", horn: "#2e1065" },
  LEGENDARY: { body: "#f59e0b", dark: "#92400e", belly: "#fde68a", horn: "#78350f" },
};

export default function BossAvatar({
  pct,
  rarity = "COMMON",
  size = 96,
}: {
  pct: number;
  rarity?: string;
  size?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dead = pct <= 0;
  const hurt = !dead && pct <= 50;
  const pal = PALETTE[rarity] ?? PALETTE.COMMON;
  const body = dead ? "#a1a1aa" : pal.body;
  const dark = dead ? "#71717a" : pal.dark;
  const belly = dead ? "#d4d4d8" : pal.belly;
  const g = `bg${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={dead ? "slain boss" : hurt ? "hurt boss" : "boss"}>
      <defs>
        <radialGradient id={g} cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor={body} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      <ellipse cx="48" cy="88" rx="28" ry="6" fill="#000" opacity="0.45" />
      {!dead && rarity === "LEGENDARY" ? (
        <path d="M32 24 L36 8 L44 18 L48 4 L52 18 L60 8 L64 24 Z" fill="#fde047" stroke="#92400e" strokeWidth="1.5" strokeLinejoin="round" />
      ) : null}
      <path d="M22 30 L14 12 L32 22 Z" fill={dead ? "#71717a" : pal.horn} />
      <path d="M74 30 L82 12 L64 22 Z" fill={dead ? "#71717a" : pal.horn} />
      {!dead && rarity === "ELITE" ? (
        <g fill={pal.horn}>
          <path d="M28 34 L24 22 L34 28 Z" />
          <path d="M68 34 L72 22 L62 28 Z" />
        </g>
      ) : null}
      <ellipse cx="48" cy="54" rx="34" ry="30" fill={`url(#${g})`} />
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
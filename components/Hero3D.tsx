// B's avatar rebuild: hand-drawn layered SVG hero with depth (gradients, gloss,
// ground shadow), idle animation (bob + blink) and swappable gear layers.
// Drop-in compatible with the old HeroAvatar props ({spec, size}).
// Scoped <style> keeps app/globals.css untouched (A's file).
import { useState } from "react";
import type { AvatarSpec, Species } from "@/lib/game/avatar";

export type Gear = "none" | "hat" | "glasses" | "sword" | "shield" | "crown";

export const GEARS: Array<{ id: Gear; name: string }> = [
  { id: "none", name: "None" },
  { id: "hat", name: "Wizard hat" },
  { id: "glasses", name: "Shades" },
  { id: "sword", name: "Sword" },
  { id: "shield", name: "Shield" },
  { id: "crown", name: "Crown" },
];

const GEAR_KEY = "arena_gear_v1";

export function loadGear(): Gear {
  try {
    const raw = localStorage.getItem(GEAR_KEY);
    return (GEARS.some((g) => g.id === raw) ? raw : "none") as Gear;
  } catch {
    return "none";
  }
}

export function saveGear(gear: Gear): void {
  try {
    localStorage.setItem(GEAR_KEY, gear);
  } catch {
    // Private mode: gear still works for this session.
  }
}

// Signature gear per species so the system shows itself before the picker lands.
const SIGNATURE: Record<Species, Gear> = { fox: "glasses", cat: "crown", dragon: "sword", frog: "hat" };

type Colorway = { dark: string; base: string; light: string; belly: string; accent: string };

const COLORWAYS: Record<Species, Colorway> = {
  fox: { dark: "#7c2d12", base: "#f97316", light: "#fdba74", belly: "#ffedd5", accent: "#431407" },
  cat: { dark: "#4c1d95", base: "#a78bfa", light: "#ddd6fe", belly: "#f5f3ff", accent: "#2e1065" },
  dragon: { dark: "#881337", base: "#fb7185", light: "#fecdd3", belly: "#fff1f2", accent: "#4c0519" },
  frog: { dark: "#065f46", base: "#34d399", light: "#a7f3d0", belly: "#ecfdf5", accent: "#022c22" },
};

function Ears({ species, c }: { species: Species; c: Colorway }) {
  if (species === "fox" || species === "cat") {
    const inner = species === "fox" ? c.accent : "#f9a8d4";
    return (
      <g stroke={c.accent} strokeWidth="3" strokeLinejoin="round">
        <path d="M26 34 L20 10 L44 24 Z" fill={c.base} />
        <path d="M70 34 L76 10 L52 24 Z" fill={c.base} />
        <path d="M28 28 L25 16 L37 23 Z" fill={inner} stroke="none" />
        <path d="M68 28 L71 16 L59 23 Z" fill={inner} stroke="none" />
      </g>
    );
  }
  if (species === "dragon") {
    return (
      <g stroke={c.accent} strokeWidth="3" strokeLinejoin="round">
        <path d="M28 32 Q16 22 20 8 Q30 16 36 26 Z" fill={c.light} />
        <path d="M68 32 Q80 22 76 8 Q66 16 60 26 Z" fill={c.light} />
      </g>
    );
  }
  return (
    <g stroke={c.accent} strokeWidth="3">
      <circle cx="32" cy="26" r="11" fill={c.base} />
      <circle cx="64" cy="26" r="11" fill={c.base} />
    </g>
  );
}

function GearLayer({ gear }: { gear: Gear }) {
  switch (gear) {
    case "hat":
      return (
        <g stroke="#18181b" strokeWidth="3" strokeLinejoin="round">
          <path d="M30 24 L52 2 L58 26 Z" fill="#475569" />
          <ellipse cx="44" cy="27" rx="20" ry="6" fill="#1e293b" />
          <path d="M42 16 L54 18 L53 23 L41 21 Z" fill="#fbbf24" stroke="none" />
        </g>
      );
    case "glasses":
      return (
        <g fill="#18181b">
          <rect x="27" y="44" width="17" height="12" rx="4" />
          <rect x="52" y="44" width="17" height="12" rx="4" />
          <rect x="43" y="47" width="10" height="3" />
          <rect x="30" y="46" width="5" height="3" rx="1.5" fill="#e2e8f0" opacity="0.8" />
          <rect x="55" y="46" width="5" height="3" rx="1.5" fill="#e2e8f0" opacity="0.8" />
        </g>
      );
    case "sword":
      return (
        <g stroke="#18181b" strokeWidth="2.5" strokeLinejoin="round">
          <g transform="rotate(35 78 60)">
            <rect x="74" y="26" width="8" height="40" rx="2" fill="#e2e8f0" />
            <rect x="66" y="64" width="24" height="6" rx="3" fill="#b45309" />
            <rect x="75" y="70" width="6" height="12" rx="3" fill="#78350f" />
            <circle cx="78" cy="84" r="3" fill="#fbbf24" />
          </g>
        </g>
      );
    case "shield":
      return (
        <g stroke="#18181b" strokeWidth="3" strokeLinejoin="round">
          <path d="M14 52 L30 52 L30 66 Q30 78 22 84 Q14 78 14 66 Z" fill="#38bdf8" />
          <path d="M18 56 L26 56 L26 66 Q26 73 22 77 Q18 73 18 66 Z" fill="#0ea5e9" stroke="none" />
          <circle cx="22" cy="64" r="3.5" fill="#fef08a" stroke="none" />
        </g>
      );
    case "crown":
      return (
        <g stroke="#18181b" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M32 22 L32 8 L40 15 L48 6 L56 15 L64 8 L64 22 Z" fill="#fbbf24" />
          <rect x="32" y="22" width="32" height="5" rx="2" fill="#b45309" />
        </g>
      );
    default:
      return null;
  }
}

export default function Hero3D({
  spec,
  size = 96,
  gear,
  tilt = true,
}: {
  spec: AvatarSpec;
  size?: number;
  gear?: Gear;
  tilt?: boolean;
}) {
  const [tiltXY, setTiltXY] = useState<[number, number]>([0, 0]);
  const c = COLORWAYS[spec.species] ?? COLORWAYS.fox;
  const g = gear ?? SIGNATURE[spec.species] ?? "none";
  const gid = `h3d-${spec.species}`;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!tilt) return;
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch {
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 16;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -12;
    setTiltXY([x, y]);
  }

  return (
    <div style={{ perspective: 320 }} onMouseMove={onMove} onMouseLeave={() => setTiltXY([0, 0])}>
      <style>{`@keyframes h3d-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.h3d-bob { animation: h3d-bob 2.6s ease-in-out infinite; }
@keyframes h3d-blink { 0%, 92%, 100% { transform: scaleY(1); } 95.5% { transform: scaleY(0.08); } }
.h3d-blink { animation: h3d-blink 4.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@media (prefers-reduced-motion: reduce) { .h3d-bob, .h3d-blink { animation: none; } }`}</style>
      <div
        style={{ transform: `rotateY(${tiltXY[0]}deg) rotateX(${tiltXY[1]}deg)`, transition: "transform 0.15s ease-out" }}
      >
        <div className="h3d-bob">
        <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`${spec.species} hero`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.light} />
              <stop offset="45%" stopColor={c.base} />
              <stop offset="100%" stopColor={c.dark} />
            </linearGradient>
          </defs>
          <ellipse cx="48" cy="90" rx="26" ry="5" fill="#000" opacity="0.35" />
          <Ears species={spec.species} c={c} />
          <ellipse cx="48" cy="58" rx="30" ry="32" fill={`url(#${gid})`} stroke={c.accent} strokeWidth="3" />
          <ellipse cx="48" cy="68" rx="17" ry="19" fill={c.belly} opacity="0.9" />
          <ellipse cx="36" cy="46" rx="7" ry="11" fill="#fff" opacity="0.35" />
          <g className="h3d-blink">
            <ellipse cx="37" cy="54" rx="6.5" ry="8" fill="#fff" stroke={c.accent} strokeWidth="2.5" />
            <ellipse cx="59" cy="54" rx="6.5" ry="8" fill="#fff" stroke={c.accent} strokeWidth="2.5" />
            <circle cx="38.5" cy="55" r="3" fill="#18181b" />
            <circle cx="60.5" cy="55" r="3" fill="#18181b" />
            <circle cx="39.5" cy="54" r="1" fill="#fff" />
            <circle cx="61.5" cy="54" r="1" fill="#fff" />
          </g>
          <g stroke={c.accent} strokeWidth="3.5" strokeLinecap="round">
            <line x1="29" y1="42" x2="43" y2="46" />
            <line x1="67" y1="42" x2="53" y2="46" />
          </g>
          <path d="M40 72 Q48 78 58 70" stroke={c.accent} strokeWidth="3" fill="none" strokeLinecap="round" />
          <GearLayer gear={g} />
        </svg>
        </div>
      </div>
    </div>
  );
}

// B's avatar rig: raster hero parts (AI-drawn, art-directed) composited in code.
// Fox has full art (body + blink + 5 gears); other species use the legacy SVG
// fallback until their art lands. Same props as before ({spec, size, gear}).
import { useEffect, useState } from "react";
import Image from "next/image";
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

const SIGNATURE: Record<Species, Gear> = { fox: "glasses", cat: "crown", dragon: "sword", frog: "hat" };

// Raster art, null = not drawn yet (falls back to SVG below).
const ART: Record<Species, { body: string; blink: string } | null> = {
  fox: { body: "/hero-parts/body-fox.png", blink: "/hero-parts/body-fox-blink.png" },
  cat: null,
  dragon: null,
  frog: null,
};

const GEAR_SRC: Record<Exclude<Gear, "none">, string> = {
  hat: "/hero-parts/gear-hat.png",
  glasses: "/hero-parts/gear-glasses.png",
  sword: "/hero-parts/gear-sword.png",
  shield: "/hero-parts/gear-shield.png",
  crown: "/hero-parts/gear-crown.png",
};

// Gear boxes as fractions of the hero frame. Tuned blind — adjust from live review.
type Box = { top: number; left: number; width: number };
const GEAR_BOX: Record<Exclude<Gear, "none">, Box> = {
  hat: { top: -0.06, left: 0.3, width: 0.42 },
  glasses: { top: 0.3, left: 0.32, width: 0.38 },
  sword: { top: 0.08, left: 0.72, width: 0.3 },
  shield: { top: 0.58, left: 0.04, width: 0.34 },
  crown: { top: -0.05, left: 0.36, width: 0.28 },
};

const FRAME_RATIO = 2 / 3; // body art is 3:2 landscape

function RasterHero({ art, gear, size }: { art: { body: string; blink: string }; gear: Gear; size: number }) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      const t = setTimeout(() => setBlink(false), 150);
      return () => clearTimeout(t);
    }, 4400);
    return () => clearInterval(id);
  }, []);
  const w = size;
  const h = Math.round(size * FRAME_RATIO);
  const box = gear === "none" ? null : GEAR_BOX[gear];
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <Image src={art.body} alt="" width={w} height={h} priority={false} />
      <Image
        src={art.blink}
        alt=""
        width={w}
        height={h}
        className="absolute inset-0 transition-opacity duration-75"
        style={{ opacity: blink ? 1 : 0 }}
      />
      {box ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={GEAR_SRC[gear as Exclude<Gear, "none">]}
          alt=""
          draggable={false}
          className="pointer-events-none absolute"
          style={{
            top: `${box.top * 100}%`,
            left: `${box.left * 100}%`,
            width: `${box.width * 100}%`,
            height: "auto",
          }}
        />
      ) : null}
    </div>
  );
}

type Colorway = { dark: string; base: string; light: string; belly: string; accent: string };

const COLORWAYS: Record<Species, Colorway> = {
  fox: { dark: "#7c2d12", base: "#f97316", light: "#fdba74", belly: "#ffedd5", accent: "#431407" },
  cat: { dark: "#4c1d95", base: "#a78bfa", light: "#ddd6fe", belly: "#f5f3ff", accent: "#2e1065" },
  dragon: { dark: "#881337", base: "#fb7185", light: "#fecdd3", belly: "#fff1f2", accent: "#4c0519" },
  frog: { dark: "#065f46", base: "#34d399", light: "#a7f3d0", belly: "#ecfdf5", accent: "#022c22" },
};

// Legacy SVG fallback for species without raster art yet.
function SvgHero({ species, size }: { species: Species; size: number }) {
  const c = COLORWAYS[species] ?? COLORWAYS.fox;
  const gid = `h3d-${species}`;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`${species} hero`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="45%" stopColor={c.base} />
          <stop offset="100%" stopColor={c.dark} />
        </linearGradient>
      </defs>
      <ellipse cx="48" cy="90" rx="26" ry="5" fill="#000" opacity="0.35" />
      <ellipse cx="48" cy="58" rx="30" ry="32" fill={`url(#${gid})`} stroke={c.accent} strokeWidth="3" />
      <ellipse cx="48" cy="68" rx="17" ry="19" fill={c.belly} opacity="0.9" />
      <ellipse cx="36" cy="46" rx="7" ry="11" fill="#fff" opacity="0.35" />
      <g className="h3d-blink">
        <ellipse cx="37" cy="54" rx="6.5" ry="8" fill="#fff" stroke={c.accent} strokeWidth="2.5" />
        <ellipse cx="59" cy="54" rx="6.5" ry="8" fill="#fff" stroke={c.accent} strokeWidth="2.5" />
        <circle cx="38.5" cy="55" r="3" fill="#18181b" />
        <circle cx="60.5" cy="55" r="3" fill="#18181b" />
      </g>
      <path d="M40 72 Q48 78 60 68" stroke={c.accent} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
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
  const g = gear ?? SIGNATURE[spec.species] ?? "none";
  const art = ART[spec.species] ?? null;

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
          {art ? (
            <RasterHero art={art} gear={g} size={size} />
          ) : (
            <SvgHero species={spec.species} size={size} />
          )}
        </div>
      </div>
    </div>
  );
}

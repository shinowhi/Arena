// Rigged hero: AI-drawn torso + 2 independently animated arm layers.
// Parts are alpha-keyed PNGs (black backgrounds keyed to transparent).
// Right arm is the raw part; left arm mirrors it via scaleX(-1).
// CSS keyframes only: idle sway loop + .attacking swing. Same {spec, size} API
// as the old avatar components so callers stay unchanged.
import type { AvatarSpec, Species } from "@/lib/game/avatar";

const PARTS: Record<Species, { torso: string; armL: string; armR: string }> = {
  fox: { torso: "/chars/fox/torso.png", armL: "/chars/fox/arm-l.png", armR: "/chars/fox/arm-r.png" },
  cat: { torso: "/chars/cat/torso.png", armL: "/chars/cat/arm-l.png", armR: "/chars/cat/arm-r.png" },
  dragon: { torso: "/chars/dragon/torso.png", armL: "/chars/dragon/arm-l.png", armR: "/chars/dragon/arm-r.png" },
  frog: { torso: "/chars/frog/torso.png", armL: "/chars/frog/arm-l.png", armR: "/chars/frog/arm-r.png" },
};

export default function CharRig({
  spec,
  size = 96,
  attacking = false,
  className = "",
}: {
  spec: AvatarSpec;
  size?: number;
  attacking?: boolean;
  className?: string;
}) {
  const parts = PARTS[spec.species] ?? PARTS.fox;
  return (
    <div
      className={`charrig ${attacking ? "attacking" : ""} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${spec.species} hero`}
    >
      <style>{`@keyframes charrig-bob { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3%) scale(1.012); } }
@keyframes charrig-sway-l { 0%, 100% { transform: rotate(7deg); } 50% { transform: rotate(-9deg); } }
@keyframes charrig-sway-r { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(9deg); } }
@keyframes charrig-swing-r { 0% { transform: rotate(-8deg); } 35% { transform: rotate(-125deg); } 65% { transform: rotate(18deg); } 100% { transform: rotate(-8deg); } }
@keyframes charrig-swing-l { 0% { transform: rotate(8deg); } 40% { transform: rotate(38deg); } 70% { transform: rotate(-14deg); } 100% { transform: rotate(8deg); } }
@keyframes charrig-lunge { 0% { transform: translateX(0); } 35% { transform: translateX(9%); } 100% { transform: translateX(0); } }
.charrig { position: relative; }
.charrig-torso { position: absolute; left: 0; top: 16.65%; width: 100%; height: auto; pointer-events: none; animation: charrig-bob 2.8s ease-in-out infinite; }
.charrig-arm { position: absolute; top: 60%; width: 42%; aspect-ratio: 3 / 2; animation-duration: 3.4s; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
.charrig-arm img { width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
.charrig-arm-l { left: -1%; transform-origin: 51% 5%; animation-name: charrig-sway-l; }
.charrig-arm-l img { transform: scaleX(-1); }
.charrig-arm-r { right: -1%; transform-origin: 49% 5%; animation-name: charrig-sway-r; animation-delay: -1.7s; }
.charrig.attacking .charrig-torso { animation: charrig-lunge 0.55s ease-out, charrig-bob 2.8s ease-in-out 0.55s infinite; }
.charrig.attacking .charrig-arm-l { animation: charrig-swing-l 0.55s ease-out; }
.charrig.attacking .charrig-arm-r { animation: charrig-swing-r 0.55s ease-out; }
@media (prefers-reduced-motion: reduce) { .charrig-torso, .charrig-arm, .charrig.attacking .charrig-torso, .charrig.attacking .charrig-arm-l, .charrig.attacking .charrig-arm-r { animation: none; } }`}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={parts.torso} alt="" draggable={false} className="charrig-torso" />
      <div className="charrig-arm charrig-arm-l" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={parts.armL} alt="" draggable={false} />
      </div>
      <div className="charrig-arm charrig-arm-r" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={parts.armR} alt="" draggable={false} />
      </div>
    </div>
  );
}

import { useId } from "react";
import { colorsOf, type AvatarSpec } from "@/lib/game/avatar";

// Layered SVG hero: gradient body + ground shadow for a 2.5D feel. No assets, no deps.
export default function HeroAvatar({ spec, size = 96 }: { spec: AvatarSpec; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { c1, c2 } = colorsOf(spec.color);
  const g = `hg${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`${spec.species} hero`}>
      <defs>
        <radialGradient id={g} cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
      </defs>
      <ellipse cx="48" cy="88" rx="26" ry="6" fill="#000" opacity="0.45" />
      {spec.accessory === "wings" ? (
        <g fill={c1} opacity="0.9">
          <ellipse cx="18" cy="52" rx="13" ry="22" transform="rotate(28 18 52)" />
          <ellipse cx="78" cy="52" rx="13" ry="22" transform="rotate(-28 78 52)" />
        </g>
      ) : null}
      {spec.species === "slime" ? (
        <g>
          <path d="M18 80 Q16 46 48 40 Q80 46 78 80 Q64 87 48 87 Q32 87 18 80 Z" fill={`url(#${g})`} />
          <ellipse cx="36" cy="54" rx="9" ry="6" fill="#fff" opacity="0.35" />
          <circle cx="38" cy="66" r="4.5" fill="#fff" />
          <circle cx="58" cy="66" r="4.5" fill="#fff" />
          <circle cx="38" cy="67" r="2" fill="#18181b" />
          <circle cx="58" cy="67" r="2" fill="#18181b" />
          <path d="M42 76 Q48 80 54 76" stroke="#18181b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      ) : null}
      {spec.species === "knight" ? (
        <g>
          <path d="M48 36 Q52 22 64 17 Q55 20 51 32 Z" fill={c1} />
          <circle cx="48" cy="59" r="24" fill={`url(#${g})`} />
          <ellipse cx="40" cy="47" rx="7" ry="4" fill="#fff" opacity="0.35" />
          <rect x="30" y="53" width="36" height="10" rx="5" fill="#18181b" />
          <rect x="36" y="55" width="10" height="6" rx="3" fill="#e4e4e7" />
          <rect x="52" y="55" width="8" height="6" rx="3" fill="#e4e4e7" />
          <path d="M42 74 Q48 77 54 74" stroke="#18181b" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      ) : null}
      {spec.species === "dragon" ? (
        <g>
          <path d="M30 46 L23 26 L41 37 Z" fill="#e7e5e4" />
          <path d="M66 46 L73 26 L55 37 Z" fill="#e7e5e4" />
          <ellipse cx="48" cy="61" rx="26" ry="22" fill={`url(#${g})`} />
          <ellipse cx="48" cy="69" rx="14" ry="9" fill="#fff" opacity="0.4" />
          <circle cx="39" cy="57" r="4" fill="#fff" />
          <circle cx="57" cy="57" r="4" fill="#fff" />
          <circle cx="39" cy="57" r="2" fill="#18181b" />
          <circle cx="57" cy="57" r="2" fill="#18181b" />
          <path d="M33 51 L44 53 M63 51 L52 53" stroke="#18181b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="44" cy="69" r="1.5" fill="#18181b" />
          <circle cx="52" cy="69" r="1.5" fill="#18181b" />
        </g>
      ) : null}
      {spec.species === "robot" ? (
        <g>
          <line x1="48" y1="38" x2="48" y2="26" stroke="#a1a1aa" strokeWidth="3" />
          <circle cx="48" cy="23" r="4" fill={c1} />
          <rect x="26" y="38" width="44" height="40" rx="12" fill={`url(#${g})`} />
          <rect x="26" y="38" width="44" height="14" rx="7" fill="#fff" opacity="0.2" />
          <rect x="32" y="50" width="32" height="12" rx="6" fill="#18181b" />
          <circle cx="41" cy="56" r="3.5" fill={c1} />
          <circle cx="55" cy="56" r="3.5" fill={c1} />
          <line x1="40" y1="69" x2="56" y2="69" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ) : null}
      {spec.accessory === "hat" ? (
        <g>
          <path d="M48 4 L63 38 L33 38 Z" fill={c2} />
          <ellipse cx="48" cy="38" rx="21" ry="5" fill={c2} />
          <circle cx="48" cy="24" r="3" fill="#fde047" />
        </g>
      ) : null}
      {spec.accessory === "crown" ? (
        <path d="M31 32 L35 15 L43 25 L48 11 L53 25 L61 15 L65 32 Z" fill="#fbbf24" stroke="#92400e" strokeWidth="1.5" strokeLinejoin="round" />
      ) : null}
      {spec.accessory === "sword" ? (
        <g transform="rotate(35 74 60)">
          <rect x="71" y="24" width="6" height="36" rx="2" fill="#e4e4e7" />
          <rect x="66" y="60" width="16" height="4" rx="2" fill="#92400e" />
          <rect x="72.5" y="64" width="3" height="10" rx="1.5" fill="#57534e" />
        </g>
      ) : null}
      {spec.accessory === "shield" ? (
        <g>
          <path d="M12 52 L25 52 L25 66 Q25 76 18.5 80 Q12 76 12 66 Z" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="2" />
          <circle cx="18.5" cy="62" r="4" fill="#e0f2fe" />
        </g>
      ) : null}
      {spec.accessory === "glasses" ? (
        <g>
          <rect x="29" y="58" width="16" height="12" rx="4" fill="#18181b" opacity="0.92" />
          <rect x="51" y="58" width="16" height="12" rx="4" fill="#18181b" opacity="0.92" />
          <line x1="45" y1="62" x2="51" y2="62" stroke="#18181b" strokeWidth="3" />
        </g>
      ) : null}
    </svg>
  );
}
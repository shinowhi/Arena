import { artOf, type AvatarSpec } from "@/lib/game/avatar";

// Generated hero art (muse-image). Portrait full-body; square crops anchor to the head.
export default function HeroAvatar({ spec, size = 96 }: { spec: AvatarSpec; size?: number }) {
  return (
    <img
      src={artOf(spec.species)}
      alt={`${spec.species} hero`}
      width={size}
      height={size}
      draggable={false}
      className="object-cover object-top select-none"
      style={{ width: size, height: size }}
    />
  );
}
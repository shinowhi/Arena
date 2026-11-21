import Image from "next/image";

const ART: Record<string, string> = {
  COMMON: "/art/boss-common.png",
  ELITE: "/art/boss-elite.png",
  LEGENDARY: "/art/boss-legendary.png",
};

// Generated boss art (muse-image). Mood via CSS filter so callers stay unchanged.
// Static public assets at a fixed size: trivially safe for next/image.
export default function BossAvatar({
  pct,
  rarity = "COMMON",
  size = 96,
}: {
  pct: number;
  rarity?: string;
  size?: number;
}) {
  const dead = pct <= 0;
  const hurt = !dead && pct <= 50;
  return (
    <Image
      src={ART[rarity] ?? ART.COMMON}
      alt={dead ? "boss đã bị hạ" : hurt ? "boss đang yếu máu" : "boss"}
      width={size}
      height={size}
      draggable={false}
      className={`rounded-full object-cover object-top select-none ${dead ? "opacity-70 grayscale" : hurt ? "brightness-90 saturate-75" : ""}`}
      style={{ width: size, height: size }}
    />
  );
}
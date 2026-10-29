export type Species = "slime" | "knight" | "dragon" | "robot";
export type Accessory = "none" | "hat" | "crown" | "sword" | "shield" | "wings" | "glasses";
export type AvatarSpec = { species: Species; accessory: Accessory; color: string };

export const SPECIES: Array<{ id: Species; name: string; skill: string; bolt: string }> = [
  { id: "slime", name: "Slime", skill: "Goo Shot", bolt: "#4ade80" },
  { id: "knight", name: "Knight", skill: "Sword Slash", bolt: "#fbbf24" },
  { id: "dragon", name: "Dragon", skill: "Fire Breath", bolt: "#fb7185" },
  { id: "robot", name: "Robot", skill: "Laser Beam", bolt: "#22d3ee" },
];

export const ACCESSORIES: Array<{ id: Accessory; name: string }> = [
  { id: "none", name: "None" },
  { id: "hat", name: "Wizard hat" },
  { id: "crown", name: "Crown" },
  { id: "sword", name: "Sword" },
  { id: "shield", name: "Shield" },
  { id: "wings", name: "Wings" },
  { id: "glasses", name: "Glasses" },
];

export const COLORS: Array<{ id: string; name: string; c1: string; c2: string }> = [
  { id: "emerald", name: "Emerald", c1: "#34d399", c2: "#065f46" },
  { id: "sky", name: "Sky", c1: "#38bdf8", c2: "#0c4a6e" },
  { id: "amber", name: "Amber", c1: "#fbbf24", c2: "#92400e" },
  { id: "violet", name: "Violet", c1: "#a78bfa", c2: "#4c1d95" },
  { id: "rose", name: "Rose", c1: "#fb7185", c2: "#881337" },
];

export const DEFAULT_AVATAR: AvatarSpec = { species: "slime", accessory: "none", color: "emerald" };

const KEY = "arena_avatar_v1";

export function skillOf(species: Species): { skill: string; bolt: string } {
  return SPECIES.find((s) => s.id === species) ?? SPECIES[0];
}

export function colorsOf(id: string): { c1: string; c2: string } {
  return COLORS.find((c) => c.id === id) ?? COLORS[0];
}

export function loadAvatar(): AvatarSpec {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_AVATAR;
    const p = JSON.parse(raw) as Partial<AvatarSpec>;
    const species = SPECIES.some((s) => s.id === p.species) ? (p.species as Species) : "slime";
    const accessory = ACCESSORIES.some((a) => a.id === p.accessory) ? (p.accessory as Accessory) : "none";
    const color = COLORS.some((c) => c.id === p.color) ? (p.color as string) : "emerald";
    return { species, accessory, color };
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function saveAvatar(spec: AvatarSpec): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(spec));
  } catch {
    // Private mode: builder still works for this session.
  }
}
export type Species = "fox" | "cat" | "frog" | "dragon";

export type AvatarSpec = { species: Species };

export const SPECIES: Array<{ id: Species; name: string; skill: string; bolt: string; art: string }> = [
  { id: "fox", name: "Fox", skill: "Flame Tail", bolt: "#fb923c", art: "/chars/fox/torso.png" },
  { id: "cat", name: "Cat", skill: "Claw Slash", bolt: "#a78bfa", art: "/chars/cat/torso.png" },
  { id: "dragon", name: "Dragon", skill: "Fire Breath", bolt: "#fb7185", art: "/chars/dragon/torso.png" },
  { id: "frog", name: "Frog", skill: "Bubble Shot", bolt: "#4ade80", art: "/chars/frog/torso.png" },
];

export const DEFAULT_AVATAR: AvatarSpec = { species: "fox" };

const KEY = "arena_avatar_v1";

export function skillOf(species: Species): { skill: string; bolt: string } {
  return SPECIES.find((s) => s.id === species) ?? SPECIES[0];
}

export function artOf(species: Species): string {
  return SPECIES.find((s) => s.id === species)?.art ?? SPECIES[0].art;
}

export function loadAvatar(): AvatarSpec {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_AVATAR;
    const p = JSON.parse(raw) as Partial<AvatarSpec>;
    const species = SPECIES.some((s) => s.id === p.species) ? (p.species as Species) : "fox";
    return { species };
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
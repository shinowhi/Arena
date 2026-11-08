import { z } from "zod";

// PVP team duel: two sides, same 5 questions, last side standing wins.
// Zero new tables for HP: a room is a shared boss row (skill_tag
// "pvp:<skill>"); sides live in pvp_sides (0008); HP derives from attacks:
//   HP = START - SELF_MISS * own_misses - ENEMY_HIT * enemy_side_corrects
// Your correct answers hurt the whole enemy side; your misses hurt only you.

export const PVP_START_HP = 100;
export const PVP_SELF_MISS = 10;
export const PVP_ENEMY_HIT = 20;
export const PVP_MAX_FIGHTERS = 10;

export const PvpSide = z.union([z.literal("A"), z.literal("B")]);
export type PvpSide = z.infer<typeof PvpSide>;

export const PvpFighter = z.object({
  player_id: z.string().min(1),
  side: PvpSide,
  correct: z.number().int().min(0),
  misses: z.number().int().min(0),
  hp: z.number().int(),
  answered: z.array(z.number().int()).length(5),
});
export type PvpFighter = z.infer<typeof PvpFighter>;

export type PvpAttack = { player_id: string; question_index: number; correct: boolean };
export type PvpClaim = { player_id: string; side: PvpSide };

// Distinct correct per (player, question); every miss row counts.
export function pvpCorrectOf(mine: PvpAttack[]): { good: Set<number>; misses: number } {
  const good = new Set<number>();
  let misses = 0;
  for (const a of mine) {
    if (a.correct) good.add(a.question_index);
    else misses += 1;
  }
  return { good, misses };
}

export function pvpHp(ownMisses: number, enemySideCorrects: number): number {
  return PVP_START_HP - PVP_SELF_MISS * ownMisses - PVP_ENEMY_HIT * enemySideCorrects;
}

export type PvpRoomState = {
  fighters: PvpFighter[];
  finished: boolean;
  winnerSide: PvpSide | null;
  draw: boolean;
};

// Full room derivation from claims + attacks. Needs both sides present;
// a side falls when every fighter hits 0. Mutual wipeout compares side HP.
export function pvpRoom(claims: PvpClaim[], attacks: PvpAttack[]): PvpRoomState {
  const byPlayer = new Map<string, PvpAttack[]>();
  for (const a of attacks) {
    if (!byPlayer.has(a.player_id)) byPlayer.set(a.player_id, []);
    byPlayer.get(a.player_id)?.push(a);
  }
  const stats = new Map<string, { good: Set<number>; misses: number }>();
  for (const c of claims) stats.set(c.player_id, pvpCorrectOf(byPlayer.get(c.player_id) ?? []));
  const sideCorrect = (side: PvpSide): number =>
    claims.reduce((s, c) => s + (c.side === side ? (stats.get(c.player_id)?.good.size ?? 0) : 0), 0);
  const correctA = sideCorrect("A");
  const correctB = sideCorrect("B");
  const fighters: PvpFighter[] = claims.map((c) => {
    const st = stats.get(c.player_id) ?? { good: new Set<number>(), misses: 0 };
    return {
      player_id: c.player_id,
      side: c.side,
      correct: st.good.size,
      misses: st.misses,
      hp: pvpHp(st.misses, c.side === "A" ? correctB : correctA),
      answered: [0, 1, 2, 3, 4].map((i) => (st.good.has(i) ? 1 : 0)),
    };
  });
  const sideA = fighters.filter((f) => f.side === "A");
  const sideB = fighters.filter((f) => f.side === "B");
  if (sideA.length === 0 || sideB.length === 0) {
    return { fighters, finished: false, winnerSide: null, draw: false };
  }
  const deadA = sideA.every((f) => f.hp <= 0);
  const deadB = sideB.every((f) => f.hp <= 0);
  if (!deadA && !deadB) return { fighters, finished: false, winnerSide: null, draw: false };
  const hpA = sideA.reduce((s, f) => s + f.hp, 0);
  const hpB = sideB.reduce((s, f) => s + f.hp, 0);
  if (deadA && deadB) {
    if (hpA === hpB) return { fighters, finished: true, winnerSide: null, draw: true };
    return { fighters, finished: true, winnerSide: hpA > hpB ? "A" : "B", draw: false };
  }
  return { fighters, finished: true, winnerSide: deadA ? "B" : "A", draw: false };
}

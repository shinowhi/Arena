import { z } from "zod";

// Battle royale rules (Day 4): up to 8 players, same 10Q paper, 30s per round.
// Wrong answer = out immediately. Timeout = out at round close. Slowest
// correct = out at round close. Last alive (or top score at the end) wins.
// Pure: mirror-tested offline in test-royale.mjs.

export const ROUND_SECONDS = 30;
export const ROYALE_QUESTIONS = 10;
export const MAX_PLAYERS = 8;

export const RoomPlayer = z.object({
  player_id: z.string().min(1),
  alive: z.boolean(),
  score: z.number().int().min(0),
  answered: z.number().int(),
  last_ms: z.number().int().min(0),
});
export type RoomPlayer = z.infer<typeof RoomPlayer>;

// Rank: score desc, then fastest last answer first.
export function rankPlayers(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => b.score - a.score || a.last_ms - b.last_ms);
}

export type RoundClose = { outs: string[]; finished: boolean; winner: string | null };

// Closes `round` (0-based) over totalRounds. Callers persist outs/winner.
export function closeRound(players: RoomPlayer[], round: number, totalRounds: number): RoundClose {
  const aliveNow = players.filter((p) => p.alive);
  // Timeouts: alive but never answered this round.
  const outs = aliveNow.filter((p) => p.answered < round).map((p) => p.player_id);
  const outSet = new Set(outs);
  const survivors = aliveNow.filter((p) => !outSet.has(p.player_id));
  if (survivors.length === 0) {
    // Everyone died: crown top score of the whole room.
    const top = rankPlayers(players)[0] ?? null;
    return { outs, finished: true, winner: top ? top.player_id : null };
  }
  if (survivors.length === 1) return { outs, finished: true, winner: survivors[0].player_id };
  const lastRound = round + 1 >= totalRounds;
  if (lastRound) {
    const top = rankPlayers(survivors)[0];
    return { outs, finished: true, winner: top.player_id };
  }
  // Slowest correct answerer goes out.
  const ranked = [...survivors].sort((a, b) => b.last_ms - a.last_ms);
  const slowest = ranked[0].player_id;
  const rest = survivors.filter((p) => p.player_id !== slowest);
  if (rest.length === 1) return { outs: [...outs, slowest], finished: true, winner: rest[0].player_id };
  return { outs: [...outs, slowest], finished: false, winner: null };
}

import { z } from "zod";
import { ExamQuestion } from "../agents/exam";

// Head-to-head exam duel rules (Day 1): one cached section, both players
// answer the same paper, higher score wins, faster wins ties. ELO K=32.
// Pure: mirror-tested offline in test-duel.mjs.

export const K_FACTOR = 32;

export type DuelSide = "p1" | "p2";
export type DuelWinner = DuelSide | "draw";
export type DuelStatus = "waiting" | "live" | "finished";

export const DuelRow = z.object({
  id: z.string().min(1),
  exam: z.enum(["vact", "hsa"]),
  section_id: z.string().min(1),
  set_as_of: z.string().min(1),
  paper: z.array(ExamQuestion).min(1),
  p1_player_id: z.string().min(1),
  p2_player_id: z.string().nullable(),
  p1_score: z.number().int().nullable(),
  p2_score: z.number().int().nullable(),
  p1_done_at: z.string().nullable(),
  p2_done_at: z.string().nullable(),
  status: z.enum(["waiting", "live", "finished"]),
  winner: z.enum(["p1", "p2", "draw"]).nullable(),
  elo_done: z.boolean(),
});
export type DuelRow = z.infer<typeof DuelRow>;

// Standard ELO. scoreA: 1 win, 0.5 draw, 0 loss — from A's perspective.
export function eloUpdate(ra: number, rb: number, scoreA: number): { na: number; nb: number } {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const na = Math.round(ra + K_FACTOR * (scoreA - ea));
  const nb = Math.round(rb + K_FACTOR * ((1 - scoreA) - (1 - ea)));
  return { na, nb };
}

type Done = { score: number; doneAt: string };

// Higher score wins. Equal scores → earlier submission wins. Equal timestamps
// (same millisecond) → draw. Unfinished sides cannot win.
export function decideWinner(p1: Done | null, p2: Done | null): DuelWinner | null {
  if (!p1 || !p2) return null;
  if (p1.score !== p2.score) return p1.score > p2.score ? "p1" : "p2";
  const t1 = new Date(p1.doneAt).getTime();
  const t2 = new Date(p2.doneAt).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t1 === t2) return "draw";
  return t1 < t2 ? "p1" : "p2";
}

export function sideOf(duel: DuelRow, playerId: string): DuelSide | null {
  if (duel.p1_player_id === playerId) return "p1";
  if (duel.p2_player_id === playerId) return "p2";
  return null;
}

// Submit-once guard: a member of a LIVE duel who has no score yet. Waiting
// duels take no submissions (no head-start tie-break farming).
export function canSubmit(duel: DuelRow, playerId: string): boolean {
  if (duel.status !== "live") return false;
  const side = sideOf(duel, playerId);
  if (!side) return false;
  return side === "p1" ? duel.p1_score === null : duel.p2_score === null;
}

export function eloScore(winner: DuelWinner | null, side: DuelSide): number {
  if (!winner || winner === "draw") return 0.5;
  return winner === side ? 1 : 0;
}

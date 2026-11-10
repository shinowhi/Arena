import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ExamQuestion } from "../agents/exam";
import { closeRound, ROYALE_QUESTIONS, ROUND_SECONDS, RoomPlayer } from "./royale";

// Server-only royale round engine. Rounds close lazily: any GET/answer first
// advances the room, so no cron or sockets are needed. Concurrent advances are
// fenced by conditional writes (only one bumps the round).

export const RoomRow = z.object({
  id: z.string().min(1),
  exam: z.enum(["vact", "hsa"]),
  section_id: z.string().min(1),
  paper: z.array(ExamQuestion).min(1),
  creator_player_id: z.string().min(1),
  status: z.enum(["lobby", "live", "finished"]),
  round: z.number().int().min(0),
  round_started_at: z.string().nullable(),
  round_ends_at: z.string().nullable(),
  winner: z.string().nullable(),
});
export type RoomRow = z.infer<typeof RoomRow>;

export type RoomState = { room: RoomRow; players: RoomPlayer[] };

export async function readRoom(supabase: SupabaseClient, id: string): Promise<RoomState | null> {
  const [r, p] = await Promise.all([
    supabase.from("exam_rooms").select("*").eq("id", id).single(),
    supabase.from("exam_room_players").select("player_id, alive, score, answered, last_ms").eq("room_id", id),
  ]);
  if (r.error || !r.data) return null;
  const room = RoomRow.safeParse(r.data);
  if (!room.success) return null;
  const players = z.array(RoomPlayer).safeParse(p.data ?? []);
  if (!players.success) return null;
  return { room: room.data, players: players.data };
}

export function roundDue(room: RoomRow, players: RoomPlayer[], now: number): boolean {
  if (room.status !== "live") return false;
  const ends = room.round_ends_at ? new Date(room.round_ends_at).getTime() : 0;
  if (Number.isFinite(ends) && now >= ends) return true;
  const alive = players.filter((p) => p.alive);
  if (alive.length <= 1) return true;
  return alive.length > 0 && alive.every((p) => p.answered >= room.round);
}

// Advances at most one round per call; callers loop or rely on the next poll.
export async function advanceRoom(supabase: SupabaseClient, id: string, now: number): Promise<RoomState | null> {
  const st = await readRoom(supabase, id);
  if (!st || !roundDue(st.room, st.players, now)) return st;
  const total = Math.min(ROYALE_QUESTIONS, st.room.paper.length);
  const close = closeRound(st.players, st.room.round, total);
  // Fence the room write FIRST: losers of a concurrent advance abort before
  // touching players, so stale outs/finishes can never land on a new round.
  if (close.finished) {
    const fin = await supabase
      .from("exam_rooms")
      .update({ status: "finished", winner: close.winner })
      .eq("id", id)
      .eq("round", st.room.round)
      .eq("status", "live")
      .select("id");
    if (fin.error || !fin.data || fin.data.length === 0) return readRoom(supabase, id);
  } else {
    const start = new Date(now).toISOString();
    const ends = new Date(now + ROUND_SECONDS * 1000).toISOString();
    const bump = await supabase
      .from("exam_rooms")
      .update({ round: st.room.round + 1, round_started_at: start, round_ends_at: ends })
      .eq("id", id)
      .eq("round", st.room.round)
      .eq("status", "live")
      .select("id");
    if (bump.error || !bump.data || bump.data.length === 0) return readRoom(supabase, id);
  }
  // Outs apply only after winning the fence, with per-row guards so a player
  // who answered between snapshot and write is never wrongly killed.
  const aliveIds = new Set(st.players.filter((p) => p.alive).map((p) => p.player_id));
  for (const pid of close.outs) {
    if (!aliveIds.has(pid)) continue;
    const snap = st.players.find((p) => p.player_id === pid);
    const timeout = snap && snap.answered < st.room.round;
    let q = supabase.from("exam_room_players").update({ alive: false }).eq("room_id", id).eq("player_id", pid).eq("alive", true);
    q = timeout ? q.lt("answered", st.room.round) : q.eq("answered", st.room.round);
    await q;
  }
  return readRoom(supabase, id);
}

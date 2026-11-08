import { createClient } from "@/lib/supabase/server";
import { skillName, isValidSkill } from "@/lib/graph/skills";
import { pvpRoom, PvpFighter, PvpSide } from "./pvp";

type Q = { level: number; prompt_latex: string; hint: string; answer_numeric: number; tolerance: number; check: unknown };
type RoomRow = {
  id: string;
  skill_tag: string;
  owner_player_id: string | null;
  despawn_at: string;
  status: string;
  questions: Q[];
};

export type PvpRoomView = {
  room_id: string;
  skill_tag: string;
  skill_name: string;
  status: string;
  despawn_at: string;
  you: string;
  your_side: PvpSide | null;
  fighters: Array<PvpFighter & { name: string }>;
  finished: boolean;
  winner_side: PvpSide | null;
  draw: boolean;
  questions: Array<{ level: number; prompt_latex: string; hint: string }>;
};

export async function loadPvpRoom(
  roomId: string,
  playerId: string,
): Promise<{ view?: PvpRoomView; error?: string; status?: number; missingTable?: boolean }> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("bosses").select("*").eq("id", roomId).single();
  const room = row as RoomRow | null;
  if (!room || !room.skill_tag.startsWith("pvp:")) return { error: "Room not found.", status: 404 };
  const skill = room.skill_tag.slice(4);
  const [claimsRes, attacksRes] = await Promise.all([
    supabase.from("pvp_sides").select("player_id, side").eq("room_id", roomId).order("created_at", { ascending: true }),
    supabase.from("attacks").select("player_id, question_index, correct").eq("boss_id", roomId).limit(1000),
  ]);
  if (claimsRes.error && (claimsRes.error as { code?: string }).code === "42P01") return { missingTable: true };
  if (claimsRes.error || attacksRes.error || !claimsRes.data || !attacksRes.data) {
    return { error: "Room lookup failed — retry.", status: 500 };
  }
  const claims = (claimsRes.data as Array<{ player_id: string; side: PvpSide }>).filter((c) => c.side === "A" || c.side === "B");
  const attacks = (attacksRes.data ?? []) as Array<{ player_id: string; question_index: number; correct: boolean }>;
  const state = pvpRoom(claims, attacks);
  // Lazy expiry: clock ran out → close the room, rank by side HP.
  let status = room.status;
  let { finished, winnerSide, draw } = {
    finished: state.finished,
    winnerSide: state.winnerSide,
    draw: state.draw,
  };
  if (!finished && status === "ALIVE" && Date.now() > new Date(room.despawn_at).getTime()) {
    status = "EXPIRED";
    await supabase.from("bosses").update({ status: "EXPIRED" }).eq("id", roomId);
    const hpA = state.fighters.filter((f) => f.side === "A").reduce((s, f) => s + f.hp, 0);
    const hpB = state.fighters.filter((f) => f.side === "B").reduce((s, f) => s + f.hp, 0);
    finished = true;
    if (hpA === hpB) draw = true;
    else winnerSide = hpA > hpB ? "A" : "B";
  }
  if (state.finished && status === "ALIVE") {
    status = "DEAD";
    await supabase.from("bosses").update({ status: "DEAD" }).eq("id", roomId);
  }
  if (status !== "ALIVE") finished = true;
  const ids = [...new Set(state.fighters.map((f) => f.player_id))];
  const { data: players } = ids.length
    ? await supabase.from("players").select("id, display_name").in("id", ids)
    : { data: [] as Array<{ id: string; display_name: string | null }> };
  const names = new Map(((players ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name]));
  return {
    view: {
      room_id: room.id,
      skill_tag: skill,
      skill_name: isValidSkill(skill) ? skillName(skill) : skill,
      status,
      despawn_at: room.despawn_at,
      you: playerId,
      your_side: claims.find((c) => c.player_id === playerId)?.side ?? null,
      fighters: state.fighters.map((f) => ({
        ...f,
        name: names.get(f.player_id) ?? "Hunter #" + f.player_id.slice(0, 4),
      })),
      finished,
      winner_side: winnerSide,
      draw,
      questions: room.questions.map((q) => ({ level: q.level, prompt_latex: q.prompt_latex, hint: q.hint })),
    },
  };
}

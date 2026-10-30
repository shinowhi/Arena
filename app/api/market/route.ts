// GET /api/market — list OPEN bounties (answers NEVER leave the server) + my XP.
// POST /api/market — post a bounty; XP escrow happens atomically in post_bounty().
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import { isValidSkill, skillName } from "@/lib/graph/skills";

const Post = z.object({
  problem_latex: z.string().trim().min(1).max(2000),
  answer_numeric: z.number().finite(),
  tolerance: z.number().positive().max(1).optional().default(0.001),
  skill_tag: z.string().refine(isValidSkill, "Unknown skill."),
  bounty: z.number().int().min(5).max(50),
});

function needMigration() {
  return NextResponse.json(
    { error: "The market needs a database update (migration 0005).", needsMigration: true },
    { status: 503 },
  );
}

export async function GET() {
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const { data: posts, error } = await db
      .from("market_posts")
      .select("id, problem_latex, skill_tag, bounty, poster_id, created_at")
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const { data: meRow } = await db.from("players").select("xp").eq("id", me).single();
    const xp = (meRow as { xp?: unknown } | null)?.xp;
    return NextResponse.json({
      xp: typeof xp === "number" ? xp : 0,
      posts: (posts ?? []).map((p) => {
        const row = p as {
          id: string; problem_latex: string; skill_tag: string;
          bounty: number; poster_id: string; created_at: string;
        };
        return {
          id: row.id,
          problem_latex: row.problem_latex,
          skill_tag: row.skill_tag,
          skill_name: isValidSkill(row.skill_tag) ? skillName(row.skill_tag) : row.skill_tag,
          bounty: row.bounty,
          poster: `Hunter #${row.poster_id.slice(0, 4)}`,
          mine: row.poster_id === me,
          created_at: row.created_at,
        };
      }),
    });
  } catch {
    return needMigration();
  }
}

export async function POST(req: Request) {
  const parsed = Post.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid bounty." }, { status: 400 });
  }
  try {
    const me = await getOrCreatePlayerId();
    const db = await createClient();
    const { data, error } = await db.rpc("post_bounty", {
      p_poster: me,
      p_problem: parsed.data.problem_latex,
      p_answer: parsed.data.answer_numeric,
      p_tolerance: parsed.data.tolerance,
      p_skill: parsed.data.skill_tag,
      p_bounty: parsed.data.bounty,
    });
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("insufficient xp")) {
        return NextResponse.json({ error: "Not enough XP — solve bosses to earn more." }, { status: 400 });
      }
      throw error;
    }
    return NextResponse.json({ id: data });
  } catch {
    return needMigration();
  }
}

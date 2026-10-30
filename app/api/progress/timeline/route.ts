import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId } from "@/lib/game/player";
import graph from "@/lib/graph/skill-graph.json";

type ScanRow = { weak_skill: string; created_at: string };
type AttackRow = {
  created_at: string;
  bosses: { skill_tag: string; status: string } | null;
};

const SKILLS = new Set((graph.skills as { id: string }[]).map((s) => s.id));

function weekStart(iso: string): string {
  const d = new Date(iso);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    // shortcut: in-JS aggregation capped at 1000 rows; move to a SQL RPC when scans/attacks grow.
    const [{ data: scans }, { data: attacks }] = await Promise.all([
      supabase.from("scans").select("weak_skill, created_at").eq("player_id", playerId).order("created_at").limit(1000),
      supabase.from("attacks").select("created_at, bosses(skill_tag, status)").eq("player_id", playerId).eq("correct", true).limit(1000),
    ]);
    const scanRows = (scans as ScanRow[] | null) ?? [];
    if (scanRows.length < 2) return NextResponse.json({ ready: false });
    const weeks = new Map<string, { red: Set<string>; green: Set<string> }>();
    const bucket = (w: string) => {
      const b = weeks.get(w) ?? { red: new Set<string>(), green: new Set<string>() };
      weeks.set(w, b);
      return b;
    };
    for (const s of scanRows) {
      if (SKILLS.has(s.weak_skill)) bucket(weekStart(s.created_at)).red.add(s.weak_skill);
    }
    for (const a of ((attacks as AttackRow[] | null) ?? [])) {
      const tag = a.bosses?.skill_tag;
      if (a.bosses?.status === "DEAD" && tag && SKILLS.has(tag)) bucket(weekStart(a.created_at)).green.add(tag);
    }
    // Green is cumulative (a healed skill stays healed); red is per-week (flagged that week).
    const healed = new Set<string>();
    const timeline = [...weeks.keys()].sort().map((week) => {
      const b = weeks.get(week)!;
      for (const g of b.green) healed.add(g);
      const skills: Record<string, "red" | "green"> = {};
      for (const g of healed) skills[g] = "green";
      for (const r of b.red) if (!healed.has(r)) skills[r] = "red";
      return { week, skills };
    });
    return NextResponse.json({ ready: true, timeline });
  } catch {
    return NextResponse.json({ error: "Could not load progress." }, { status: 500 });
  }
}
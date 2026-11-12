import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import {
  CLASS_TIER_CODES,
  generateJoinCode,
  isClassTierCode,
  seatsFor,
} from "@/lib/center/center";

// Create a center class (migration 0018). Any authenticated player may create
// one — they become the teacher. Seats come from the tier's plan row (the
// plan must exist in the plans catalog and be active); the client sends no
// seat count.
//
// BILLING SPLIT (v1 manual phase): creating a class costs nothing in-app BUT
// the class starts PENDING and grants nothing until the admin flips it to
// active after confirming the tier payment (the CENTER pays 780k/999k/1.49M
// VND through the EXISTING orders flow — class_20/30/50 live in the same
// plans catalog). Do NOT build a center checkout here. Pending-by-default
// closes the free-VIP hole (create-then-join, or two users cross-creating);
// students keep their rows across flips but VIP requires an ACTIVE class.
const Body = z.object({
  center_name: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(80),
  plan_code: z.string(),
});

type PlanRow = { code: string; active: boolean };
type CenterRow = { id: string };
type ClassRow = { id: string; join_code: string; seats: number; status: string };

const JOIN_RETRIES = 5;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send a class name and a class_* plan code." }, { status: 400 });
  }
  // 20/min per player-or-IP. Read-only identity: the 429 path mints nothing.
  const gateId = await getPlayerId().catch(() => null);
  const rl = checkRate(`center-classes:${gateId ?? getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const { center_name, name, plan_code } = parsed.data;
  if (!isClassTierCode(plan_code)) {
    return NextResponse.json(
      { error: `Unknown class tier — pick one of ${CLASS_TIER_CODES.join(", ")}.` },
      { status: 400 },
    );
  }
  try {
    const playerId = await getOrCreatePlayerId();
    // Tighter per-teacher bucket: pending classes are cheap to mint, so slow
    // mass-creation (each still needs manual admin activation to grant VIP).
    const prl = checkRate(`center-classes-new:${playerId}`, 5, MINUTE_MS);
    if (!prl.ok) return rateLimitResponse(prl.retryAfterSec);
    const supabase = await createClient();
    // The tier must be a live catalog row: a paused plan blocks new classes.
    const plan = await supabase.from("plans").select("code, active").eq("code", plan_code).single();
    if (plan.error || !plan.data) {
      return NextResponse.json(
        { error: "Center tiers are not set up yet — run migration 0018." },
        { status: 503 },
      );
    }
    if ((plan.data as PlanRow).active !== true) {
      return NextResponse.json(
        { error: "That class tier is paused — pick another tier." },
        { status: 400 },
      );
    }
    const seats = seatsFor(plan_code);
    if (seats === null) {
      return NextResponse.json({ error: "Unknown class tier." }, { status: 400 });
    }
    let centerId: string | null = null;
    if (center_name) {
      const center = await supabase.from("centers").insert({ name: center_name }).select("id").single();
      if (center.error || !center.data) {
        return NextResponse.json(
          { error: "Centers are not set up yet — run migration 0018." },
          { status: 503 },
        );
      }
      centerId = (center.data as CenterRow).id;
    }
    // Join codes are unique: retry on the rare collision.
    let created: ClassRow | null = null;
    for (let attempt = 0; attempt < JOIN_RETRIES && !created; attempt += 1) {
      const join_code = generateJoinCode();
      const ins = await supabase
        .from("classes")
        .insert({
          center_id: centerId,
          name,
          teacher_player_id: playerId,
          plan_code,
          seats,
          status: "pending",
          join_code,
        })
        .select("id, join_code, seats, status")
        .single();
      if (!ins.error && ins.data) {
        created = ins.data as ClassRow;
      } else if (!/duplicate|unique/i.test(ins.error?.message ?? "")) {
        return NextResponse.json(
          { error: "Classes are not set up yet — run migration 0018." },
          { status: 503 },
        );
      }
    }
    if (!created) {
      return NextResponse.json({ error: "Could not mint a join code — retry." }, { status: 500 });
    }
    return NextResponse.json({
      id: created.id,
      join_code: created.join_code,
      seats: created.seats,
      status: created.status,
      plan_code,
      center_id: centerId,
    });
  } catch {
    return NextResponse.json({ error: "Could not create class." }, { status: 500 });
  }
}

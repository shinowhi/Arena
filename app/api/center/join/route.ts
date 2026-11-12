import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeJoinCode } from "@/lib/center/center";

// Join a class by code (migration 0018). The code must name an ACTIVE class
// with a free seat, and the student must not already hold an enrollment row
// for it. New rows insert active=true. No payment check in v1 (manual phase
// — see POST /api/center/classes header): joining an unpaid-but-active class
// works until the admin flips it to expired.
//
// Seat races: two simultaneous joins can both pass the count check (no DB
// seat guard in v1) — slight overfill is possible under a race; the
// (class, student) unique index still prevents double enrollment.
const Body = z.object({ code: z.string() });

type ClassRow = { id: string; name: string; seats: number; status: string; teacher_player_id: string };
type EnrollmentRow = { id: string; active: boolean };

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send a join code." }, { status: 400 });
  }
  // 20/min per player-or-IP. Read-only identity: the 429 path mints nothing.
  const gateId = await getPlayerId().catch(() => null);
  const rl = checkRate(`center-join:${gateId ?? getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const code = normalizeJoinCode(parsed.data.code);
  if (!code) {
    return NextResponse.json(
      { error: "That code looks wrong — it should look like CENTER-ABCDEF." },
      { status: 400 },
    );
  }
  try {
    const playerId = await getOrCreatePlayerId();
    const supabase = await createClient();
    const cls = await supabase
      .from("classes")
      .select("id, name, seats, status, teacher_player_id")
      .eq("join_code", code)
      .single();
    if (cls.error || !cls.data) {
      return NextResponse.json({ error: "No class uses that code." }, { status: 404 });
    }
    const klass = cls.data as ClassRow;
    if (klass.status !== "active") {
      return NextResponse.json(
        { error: "That class is not active yet — ask your teacher when it opens." },
        { status: 403 },
      );
    }
    // Teachers cannot enroll in their own class: without this, anyone mints
    // free full VIP by creating a class and joining it (no payment involved).
    if (klass.teacher_player_id === playerId) {
      return NextResponse.json(
        { error: "Teachers cannot join their own class as a student." },
        { status: 403 },
      );
    }
    const existing = await supabase
      .from("enrollments")
      .select("id, active")
      .eq("class_id", klass.id)
      .eq("student_player_id", playerId)
      .limit(1);
    if (existing.error) {
      return NextResponse.json(
        { error: "Enrollments are not set up yet — run migration 0018." },
        { status: 503 },
      );
    }
    const row = (existing.data as EnrollmentRow[] | null)?.[0];
    if (row) {
      if (row.active) {
        return NextResponse.json(
          { error: "You are already enrolled in that class.", class_id: klass.id },
          { status: 409 },
        );
      }
      // Inactive rows exist only via manual admin SQL (nothing flips active
      // in v1, and there is no update policy to reactivate through).
      return NextResponse.json(
        { error: "Your enrollment was deactivated — ask your teacher." },
        { status: 403 },
      );
    }
    const count = await supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("class_id", klass.id)
      .eq("active", true);
    if (count.error) {
      return NextResponse.json(
        { error: "Enrollments are not set up yet — run migration 0018." },
        { status: 503 },
      );
    }
    if ((count.count ?? 0) >= klass.seats) {
      return NextResponse.json({ error: "That class is full." }, { status: 409 });
    }
    const ins = await supabase
      .from("enrollments")
      .insert({ class_id: klass.id, student_player_id: playerId, active: true })
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      // Lost a race with a duplicate insert: report already-enrolled.
      if (/duplicate|unique/i.test(ins.error?.message ?? "")) {
        return NextResponse.json(
          { error: "You are already enrolled in that class.", class_id: klass.id },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Could not join class." }, { status: 500 });
    }
    return NextResponse.json({
      enrollment_id: (ins.data as { id: string }).id,
      class_id: klass.id,
      class_name: klass.name,
    });
  } catch {
    return NextResponse.json({ error: "Could not join class." }, { status: 500 });
  }
}

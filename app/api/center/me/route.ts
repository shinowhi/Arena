import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";
import { hasEnrollmentVip } from "@/lib/center/center";
import { loadMasteryInput } from "@/lib/mastery/load";
import { skillName } from "@/lib/graph/skills";

// My center roles (migration 0018). Read-only identity: unknown visitors get
// empty roles, no player is minted. teaching[] carries the roster with
// per-student activity counts (reusing the mastery loader — counts only, no
// answers or keys) plus the class join code; enrolled[] carries the class
// info with its assignments and due dates. enrollment_vip is gated ONLY on
// active enrollment in an ACTIVE class (see hasEnrollmentVip).
type ClassRow = {
  id: string;
  center_id: string | null;
  name: string;
  plan_code: string;
  seats: number;
  status: string;
  join_code: string;
  centers: { name: string } | Array<{ name: string }> | null;
};
type EnrollmentRow = { student_player_id: string; created_at: string };
type MyEnrollmentRow = {
  class_id: string;
  active: boolean;
  classes: ClassRow | ClassRow[] | null;
};
type AssignmentRow = {
  id: string;
  skill_tag: string;
  title: string;
  due_at: string | null;
  created_at: string;
};

export type RosterStudent = {
  student: string;
  enrolled_at: string;
  attempts: number;
  scans: number;
  slain: number;
};

function centerName(row: ClassRow): string | null {
  const c = Array.isArray(row.centers) ? row.centers[0] : row.centers;
  return c?.name ?? null;
}

function oneClass(row: MyEnrollmentRow): ClassRow | null {
  const c = Array.isArray(row.classes) ? row.classes[0] : row.classes;
  return c ?? null;
}

// Activity counts for one student via the shared mastery loader (attempts +
// scans + slain — the same EXISTING tables, no new reads). A loader failure
// degrades to zeros for that student, never breaks the roster.
async function rosterStats(
  supabase: SupabaseClient,
  studentId: string,
): Promise<{ attempts: number; scans: number; slain: number }> {
  try {
    const input = await loadMasteryInput(supabase, studentId);
    return { attempts: input.attempts.length, scans: input.scans.length, slain: input.slain.length };
  } catch {
    return { attempts: 0, scans: 0, slain: 0 };
  }
}

export async function GET(req: Request) {
  // 20/min per player-or-IP. Read-only identity: the 429 path mints nothing.
  const gateId = await getPlayerId().catch(() => null);
  const rl = checkRate(`center-me:${gateId ?? getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!gateId) {
    return NextResponse.json({ player_id: null, enrollment_vip: false, teaching: [], enrolled: [] });
  }
  try {
    const supabase = await createClient();
    const [teachingRes, enrolledRes, vip] = await Promise.all([
      supabase
        .from("classes")
        .select("id, center_id, name, plan_code, seats, status, join_code, centers(name)")
        .eq("teacher_player_id", gateId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("enrollments")
        .select("class_id, active, classes!inner(id, center_id, name, plan_code, seats, status, join_code, centers(name))")
        .eq("student_player_id", gateId)
        .eq("active", true)
        .limit(50),
      hasEnrollmentVip(supabase, gateId),
    ]);
    if (teachingRes.error || enrolledRes.error) {
      return NextResponse.json(
        { error: "Centers are not set up yet — run migration 0018." },
        { status: 503 },
      );
    }
    const teachingRows = (teachingRes.data as ClassRow[] | null) ?? [];
    const teaching = await Promise.all(
      teachingRows.map(async (klass) => {
        const [rosterRes, assignRes] = await Promise.all([
          supabase
            .from("enrollments")
            .select("student_player_id, created_at")
            .eq("class_id", klass.id)
            .eq("active", true)
            .order("created_at", { ascending: true })
            .limit(100),
          supabase
            .from("assignments")
            .select("id, skill_tag, title, due_at, created_at")
            .eq("class_id", klass.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        const rosterRows = (rosterRes.data as EnrollmentRow[] | null) ?? [];
        const stats = await Promise.all(
          rosterRows.map((r) => rosterStats(supabase, r.student_player_id)),
        );
        const roster: RosterStudent[] = rosterRows.map((r, i) => ({
          student: r.student_player_id,
          enrolled_at: r.created_at,
          ...stats[i],
        }));
        const assignments = ((assignRes.data as AssignmentRow[] | null) ?? []).map((a) => ({
          ...a,
          skill_name: skillName(a.skill_tag),
        }));
        return {
          id: klass.id,
          name: klass.name,
          center: centerName(klass),
          plan_code: klass.plan_code,
          seats: klass.seats,
          enrolled: roster.length,
          status: klass.status,
          join_code: klass.join_code,
          roster,
          assignments,
        };
      }),
    );
    const enrolledRows = (enrolledRes.data as MyEnrollmentRow[] | null) ?? [];
    const classIds = enrolledRows.map((r) => oneClass(r)?.id).filter((v): v is string => !!v);
    const assignRes =
      classIds.length > 0
        ? await supabase
            .from("assignments")
            .select("id, class_id, skill_tag, title, due_at, created_at")
            .in("class_id", classIds)
            .order("created_at", { ascending: false })
            .limit(200)
        : { data: [] as Array<AssignmentRow & { class_id: string }> };
    const byClass = new Map<string, Array<AssignmentRow & { skill_name: string }>>();
    for (const a of ((assignRes.data as Array<AssignmentRow & { class_id: string }> | null) ?? [])) {
      const list = byClass.get(a.class_id) ?? [];
      list.push({ ...a, skill_name: skillName(a.skill_tag) });
      byClass.set(a.class_id, list);
    }
    const enrolled = enrolledRows.flatMap((r) => {
      const klass = oneClass(r);
      if (!klass) return [];
      return [
        {
          class_id: klass.id,
          name: klass.name,
          center: centerName(klass),
          status: klass.status,
          assignments: byClass.get(klass.id) ?? [],
        },
      ];
    });
    return NextResponse.json({ player_id: gateId, enrollment_vip: vip, teaching, enrolled });
  } catch {
    return NextResponse.json({ error: "Could not load center roles." }, { status: 500 });
  }
}

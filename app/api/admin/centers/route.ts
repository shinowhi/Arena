import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Admin center desk (migration 0018). The admin cookie is verified FIRST,
// before the service client is touched (same pattern as /api/admin/orders):
// the service key bypasses RLS, and classes has NO update policy, so the
// status flip MUST go through the set_class_status RPC.
// GET -> {centers, classes}; PATCH {class_id, status} -> {class_id, status}.
//
// Manual billing phase: an unpaid class is deactivated by flipping it to
// expired (students keep their enrollment rows but lose enrollment VIP,
// which requires an ACTIVE class); re-open it by flipping back to active.
const PatchBody = z.object({
  class_id: z.string().uuid(),
  status: z.enum(["pending", "active", "expired", "cancelled"]),
});

function serviceClientOr503() {
  try {
    return { supabase: createServiceClient(), res: null };
  } catch {
    return {
      supabase: null,
      res: NextResponse.json(
        { error: "Center admin is not configured yet — set SUPABASE_SERVICE_ROLE_KEY on the server." },
        { status: 503 },
      ),
    };
  }
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rl = checkRate(`admin-centers:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const { supabase, res } = serviceClientOr503();
  if (!supabase) return res;
  const [centers, classes, enrollments] = await Promise.all([
    supabase.from("centers").select("id, name, created_at").order("created_at", { ascending: false }).limit(200),
    supabase
      .from("classes")
      .select("id, center_id, name, teacher_player_id, plan_code, seats, status, join_code, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("enrollments").select("class_id").eq("active", true).limit(20000),
  ]);
  if (centers.error || classes.error || enrollments.error) {
    return NextResponse.json(
      { error: "Centers are not set up yet — run migration 0018." },
      { status: 503 },
    );
  }
  const counts = new Map<string, number>();
  for (const row of (enrollments.data as { class_id: string }[] | null) ?? []) {
    counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
  }
  const rows = ((classes.data as Record<string, unknown>[] | null) ?? []).map((c) => ({
    ...c,
    enrolled: counts.get(c.id as string) ?? 0,
  }));
  return NextResponse.json({ centers: centers.data ?? [], classes: rows });
}

export async function PATCH(req: Request) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rl = checkRate(`admin-centers:${getClientIp(req)}`, 20, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send a class_id and pending|active|expired|cancelled." },
      { status: 400 },
    );
  }
  const { supabase, res } = serviceClientOr503();
  if (!supabase) return res;
  const { data, error } = await supabase.rpc("set_class_status", {
    p_class: parsed.data.class_id,
    p_status: parsed.data.status,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/set_class_status|does not exist|schema cache|function .* not/i.test(msg)) {
      return NextResponse.json(
        { error: "Centers are not set up yet — run migration 0018." },
        { status: 503 },
      );
    }
    if (/class_not_found/i.test(msg)) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }
    if (/class_bad_status/i.test(msg)) {
      return NextResponse.json(
        { error: "Bad status — send pending|active|expired|cancelled." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Could not update class status." }, { status: 500 });
  }
  return NextResponse.json({ class_id: parsed.data.class_id, status: data });
}

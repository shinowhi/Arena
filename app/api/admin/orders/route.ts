import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { logFunnel } from "@/lib/funnel";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Admin order desk (migration 0016). The admin cookie is verified FIRST,
// before the service client is touched (same pattern as /api/admin/codes):
// the service key bypasses RLS, and orders has NO update policy, so both the
// approve RPC and the reject update MUST go through the service client.
// GET -> {orders: pending...}; PATCH {order_id, action} -> {order, subscription_id?}.
const PatchBody = z.object({
  order_id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

function serviceClientOr503() {
  try {
    return { supabase: createServiceClient(), res: null };
  } catch {
    return {
      supabase: null,
      res: NextResponse.json(
        { error: "Billing admin is not configured yet — set SUPABASE_SERVICE_ROLE_KEY on the server." },
        { status: 503 },
      ),
    };
  }
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rl = checkRate(`admin-orders:${getClientIp(req)}`, 60, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const { supabase, res } = serviceClientOr503();
  if (!supabase) return res;
  const { data, error } = await supabase
    .from("orders")
    .select("id, player_id, plan_code, amount_vnd, memo, status, note, created_at, decided_at, payer_ref, device_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "Billing is not set up yet — run migration 0016." },
      { status: 503 },
    );
  }
  return NextResponse.json({ orders: data ?? [] });
}

export async function PATCH(req: Request) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rl = checkRate(`admin-orders:${getClientIp(req)}`, 60, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send an order_id and approve|reject." }, { status: 400 });
  }
  const { supabase, res } = serviceClientOr503();
  if (!supabase) return res;
  if (parsed.data.action === "approve") {
    const { data, error } = await supabase.rpc("approve_order", {
      p_order: parsed.data.order_id,
    });
    if (error) {
      const msg = error.message ?? "";
      if (/approve_order|does not exist|schema cache|function .* not/i.test(msg)) {
        return NextResponse.json(
          { error: "Billing is not set up yet — run migration 0016." },
          { status: 503 },
        );
      }
      if (/order_not_pending/i.test(msg)) {
        return NextResponse.json(
          { error: "That order was already decided." },
          { status: 409 },
        );
      }
      if (/order_not_found/i.test(msg)) {
        return NextResponse.json({ error: "Order not found." }, { status: 404 });
      }
      if (/order_plan_inactive/i.test(msg)) {
        return NextResponse.json(
          { error: "That plan is no longer active — reject the order and refund." },
          { status: 400 },
        );
      }
      if (/order_underpaid/i.test(msg)) {
        return NextResponse.json(
          { error: "Order amount is below the plan price — verify payment before approving." },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: "Could not approve order." }, { status: 500 });
    }
    // Best-effort funnel: look up the buyer for the order_approved event.
    try {
      const r = await supabase
        .from("orders")
        .select("player_id, plan_code, amount_vnd")
        .eq("id", parsed.data.order_id)
        .single();
      const row = r.data as { player_id: string; plan_code: string; amount_vnd: number } | null;
      if (row) {
        await logFunnel(supabase, row.player_id, "order_approved", {
          plan: row.plan_code,
          amount_vnd: row.amount_vnd,
        });
      }
    } catch {
      // Funnel must never break the admin path.
    }
    return NextResponse.json({ order_id: parsed.data.order_id, subscription_id: data });
  }
  // Reject: direct update through the SERVICE client (bypasses RLS — orders
  // has no update policy by design). Guarded to pending-only, same as the RPC.
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", parsed.data.order_id)
    .eq("status", "pending")
    .select("id");
  if (error) {
    return NextResponse.json(
      { error: "Billing is not set up yet — run migration 0016." },
      { status: 503 },
    );
  }
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json(
      { error: "Order not found, or it was already decided." },
      { status: 404 },
    );
  }
  return NextResponse.json({ order_id: parsed.data.order_id });
}

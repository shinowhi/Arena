import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePlayerId, getPlayerId } from "@/lib/game/player";
import { generateMemo } from "@/lib/billing/plans";
import { logFunnel } from "@/lib/funnel";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Manual-transfer orders (slice-1 infra): the buyer creates a pending order,
// transfers VND with the memo in the note, and an admin approves it in
// /admin/billing (approve_order RPC). POST {plan_code} -> {order_id, memo,
// amount_vnd, plan, transfer_note}. GET lists the caller's own orders
// (read-only identity: unknown visitors get [], never a minted player).
const Body = z.object({
  plan_code: z.string().min(1).max(64),
  payer_ref: z.string().max(64).optional(),
  device_id: z.string().max(64).optional(),
});

type PlanRow = {
  code: string;
  name: string;
  product: string;
  price_vnd: number;
  period_days: number;
  active: boolean;
};

async function activePlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
): Promise<{ plan: PlanRow | null; missing: boolean }> {
  const { data, error } = await supabase
    .from("plans")
    .select("code, name, product, price_vnd, period_days, active")
    .eq("code", code)
    .eq("active", true)
    .limit(1);
  if (error) return { plan: null, missing: true };
  const row = (Array.isArray(data) ? data[0] : null) as PlanRow | null;
  return { plan: row ?? null, missing: false };
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a plan first." }, { status: 400 });
  }
  // IP bucket BEFORE identity: order spam must not mint a player row per
  // attempt (same two-layer shape as the VIP claim route).
  const ipRl = checkRate(`billing-orders:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  try {
    // Purchase intent: minting a player here is OK (they are buying).
    const playerId = await getOrCreatePlayerId();
    const rl = checkRate(`billing-orders:${playerId}`, 10, MINUTE_MS);
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
    const supabase = await createClient();
    const { plan, missing } = await activePlan(supabase, parsed.data.plan_code);
    if (missing) {
      return NextResponse.json(
        { error: "Billing is not set up yet — run migration 0016." },
        { status: 503 },
      );
    }
    if (!plan) {
      return NextResponse.json({ error: "That plan is not available." }, { status: 400 });
    }
    // Insert the pending order; on a memo collision (unique index) retry with
    // a fresh memo a few times before giving up.
    let orderId: string | null = null;
    let memo = "";
    for (let attempt = 0; attempt < 5 && !orderId; attempt += 1) {
      memo = generateMemo();
      const r = await supabase
        .from("orders")
        .insert({
          player_id: playerId,
          plan_code: plan.code,
          amount_vnd: plan.price_vnd,
          memo,
          // Optional manual-review hints, stored as-is (phone/MoMo/bank ref +
          // client localStorage fingerprint; never trusted for auth).
          payer_ref: parsed.data.payer_ref ?? null,
          device_id: parsed.data.device_id ?? null,
        })
        .select("id")
        .single();
      if (!r.error && r.data) {
        orderId = (r.data as { id: string }).id;
      } else if (!/duplicate|unique|already/i.test(r.error?.message ?? "")) {
        return NextResponse.json(
          { error: "Billing is not set up yet — run migration 0016." },
          { status: 503 },
        );
      }
    }
    if (!orderId) {
      return NextResponse.json({ error: "Could not create order — retry." }, { status: 500 });
    }
    await logFunnel(supabase, playerId, "order_created", {
      plan: plan.code,
      amount_vnd: plan.price_vnd,
    });
    return NextResponse.json(
      {
        order_id: orderId,
        memo,
        amount_vnd: plan.price_vnd,
        plan: {
          code: plan.code,
          name: plan.name,
          product: plan.product,
          period_days: plan.period_days,
        },
        transfer_note:
          `Transfer ${plan.price_vnd.toLocaleString("en-US")} VND with memo ${memo} ` +
          `in the transfer note. Your pack unlocks after the admin confirms payment.`,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Could not create order — retry." }, { status: 500 });
  }
}

export async function GET() {
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) return NextResponse.json({ orders: [] });
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, plan_code, amount_vnd, memo, status, created_at, decided_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false });
    if (error || !Array.isArray(data)) return NextResponse.json({ orders: [] });
    return NextResponse.json({ orders: data });
  } catch {
    return NextResponse.json({ orders: [] });
  }
}

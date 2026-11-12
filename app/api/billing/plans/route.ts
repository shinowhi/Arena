import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Public plan catalog: GET -> {plans: [...]}. No auth (prices are public).
// Reads the plans table (migration 0016 seed); an empty/error read means the
// migration hasn't run yet -> 503, same convention as the VIP routes.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plans")
      .select("code, name, product, price_vnd, period_days")
      .eq("active", true)
      .order("price_vnd", { ascending: true });
    if (error || !Array.isArray(data)) {
      return NextResponse.json(
        { error: "Billing is not set up yet — run migration 0016." },
        { status: 503 },
      );
    }
    return NextResponse.json({ plans: data });
  } catch {
    return NextResponse.json(
      { error: "Billing is not set up yet — run migration 0016." },
      { status: 503 },
    );
  }
}

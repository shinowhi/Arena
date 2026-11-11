import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Liveness probe: {ok, db, version, time}. db is a cheap players head-select
// (false on any error — never throws). version is the Vercel commit short
// SHA, or "local" outside Vercel.
export async function GET() {
  let db = false;
  try {
    const supabase = await createClient();
    const r = await supabase.from("players").select("id", { head: true }).limit(1);
    db = !r.error;
  } catch {
    db = false;
  }
  return NextResponse.json({
    ok: true,
    db,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    time: new Date().toISOString(),
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { consentAllowed, getAuthUser } from "@/lib/auth/session";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// POST /api/family/consent — record parental consent for one kid (consents v1:
// DB row only, no email sender). Auth-required: the caller needs a verified
// session whose link role is 'parent', AND must parent an ACTIVE family
// containing that child (service reads on families/family_members). Identity
// is the LINKED player (the stronger proof — not the cookie).
// Write rule (no blind upsert): select the existing row first — none ->
// insert; same parent -> refresh policy_version only; another parent's row ->
// 409 {error:'already-consented'} (one consent row per child, never stolen).
const Body = z.object({ child_player_id: z.uuid() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a kid first." }, { status: 400 });
  }
  const ipRl = checkRate(`family-consent:${getClientIp(req)}`, 10, MINUTE_MS);
  if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSec);
  let auth: Awaited<ReturnType<typeof createAuthClient>>;
  try {
    auth = await createAuthClient();
  } catch {
    return NextResponse.json(
      { error: "Login is not set up yet — try again later." },
      { status: 503 },
    );
  }
  const user = await getAuthUser(auth);
  if (!user) {
    return NextResponse.json(
      { error: "Log in as a parent to record consent." },
      { status: 401 },
    );
  }
  const rl = checkRate(`family-consent:${user.id}`, 10, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const supabase = await createClient();
  const link = await supabase
    .from("auth_links")
    .select("player_id, role")
    .eq("auth_user_id", user.id)
    .limit(1);
  if (link.error) {
    return NextResponse.json(
      { error: "Account linking is not set up yet — run migration 0020." },
      { status: 503 },
    );
  }
  const linkRow =
    Array.isArray(link.data) && link.data.length > 0
      ? (link.data[0] as { player_id: string; role: string })
      : null;
  if (!linkRow || linkRow.role !== "parent") {
    return NextResponse.json(
      { error: "Only a linked parent account can record consent." },
      { status: 403 },
    );
  }
  const childId = parsed.data.child_player_id;
  const fam = await supabase
    .from("families")
    .select("id")
    .eq("parent_player_id", linkRow.player_id)
    .eq("status", "active")
    .limit(1);
  if (fam.error) {
    return NextResponse.json(
      { error: "Family is not set up yet — run migration 0017." },
      { status: 503 },
    );
  }
  if (!Array.isArray(fam.data) || fam.data.length === 0) {
    return NextResponse.json({ error: "You have no active family." }, { status: 403 });
  }
  const familyId = (fam.data[0] as { id: string }).id;
  const mem = await supabase
    .from("family_members")
    .select("id")
    .eq("family_id", familyId)
    .eq("child_player_id", childId)
    .limit(1);
  if (mem.error) {
    return NextResponse.json(
      { error: "Family is not set up yet — run migration 0017." },
      { status: 503 },
    );
  }
  if (!consentAllowed(Array.isArray(mem.data) && mem.data.length > 0)) {
    return NextResponse.json({ error: "That kid is not in your family." }, { status: 403 });
  }
  const existing = await supabase
    .from("consents")
    .select("parent_auth_user_id")
    .eq("child_player_id", childId)
    .limit(1);
  if (existing.error) {
    return NextResponse.json(
      { error: "Consents are not set up yet — run migration 0020." },
      { status: 503 },
    );
  }
  const row =
    Array.isArray(existing.data) && existing.data.length > 0
      ? (existing.data[0] as { parent_auth_user_id: string })
      : null;
  if (row) {
    if (row.parent_auth_user_id !== user.id) {
      return NextResponse.json({ error: "already-consented" }, { status: 409 });
    }
    const up = await supabase
      .from("consents")
      .update({ policy_version: "v1" })
      .eq("child_player_id", childId);
    if (up.error) {
      return NextResponse.json(
        { error: "Consents are not set up yet — run migration 0020." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true });
  }
  const ins = await supabase.from("consents").insert({
    parent_auth_user_id: user.id,
    child_player_id: childId,
    policy_version: "v1",
  });
  if (ins.error) {
    // Lost an insert race (UNIQUE(child_player_id)): re-read so a rival
    // parent's winning row reports 409 instead of a generic 503.
    const re = await supabase
      .from("consents")
      .select("parent_auth_user_id")
      .eq("child_player_id", childId)
      .limit(1);
    const reRow =
      !re.error && Array.isArray(re.data) && re.data.length > 0
        ? (re.data[0] as { parent_auth_user_id: string })
        : null;
    if (reRow && reRow.parent_auth_user_id !== user.id) {
      return NextResponse.json({ error: "already-consented" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Consents are not set up yet — run migration 0020." },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}

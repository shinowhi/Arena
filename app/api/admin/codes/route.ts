import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { normalizeCode } from "@/lib/vip";
import { checkRate, getClientIp, MINUTE_MS, rateLimitResponse } from "@/lib/rate-limit";

// Admin VIP-code inventory (migration 0012). Both handlers require the same
// arena_admin cookie as /admin (verified FIRST, before the service client is
// touched). Writes/reads go through SECURITY DEFINER RPCs (admin_create_code
// / admin_list_codes) with the SERVICE-ROLE key, because vip_codes has no anon
// policies (deny-all by design) and EXECUTE on the admin_* RPCs is revoked
// from every public role — see the 0012 header.
const CreateBody = z.object({
  code: z.string().min(8).max(32).optional(),
  max_uses: z.number().int().min(1).max(100000).default(1),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().max(200).optional(),
});

function serviceClientOr503() {
  try {
    return { supabase: createServiceClient(), res: null };
  } catch {
    return {
      supabase: null,
      res: NextResponse.json(
        { error: "VIP admin is not configured yet — set SUPABASE_SERVICE_ROLE_KEY on the server." },
        { status: 503 },
      ),
    };
  }
}

function autoCode(): string {
  return `VIP-${randomBytes(6).toString("base64url").toUpperCase()}`;
}

export async function GET(req: Request) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rl = checkRate(`admin-codes:${getClientIp(req)}`, 60, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const { supabase, res } = serviceClientOr503();
  if (!supabase) return res;
  const { data, error } = await supabase.rpc("admin_list_codes");
  if (error) {
    return NextResponse.json(
      { error: "VIP is not set up yet — run migration 0012." },
      { status: 503 },
    );
  }
  return NextResponse.json({ codes: data ?? [] });
}

export async function POST(req: Request) {
  if (!verifyAdminRequest(req)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rl = checkRate(`admin-codes:${getClientIp(req)}`, 60, MINUTE_MS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const codeIssue = parsed.error.issues.find((i) => i.path[0] === "code");
    if (codeIssue) {
      return NextResponse.json(
        { error: "Custom codes must be 8–32 characters." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Invalid code fields." }, { status: 400 });
  }
  const code = parsed.data.code ? normalizeCode(parsed.data.code) : autoCode();
  if (!code) return NextResponse.json({ error: "Code must be 8–32 characters." }, { status: 400 });
  const { supabase, res } = serviceClientOr503();
  if (!supabase) return res;
  const { error } = await supabase.rpc("admin_create_code", {
    p_code: code,
    p_max: parsed.data.max_uses,
    p_expires: parsed.data.expires_at ?? null,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/vip_code_length|vip_code_bad_max/i.test(msg)) {
      return NextResponse.json(
        { error: "Custom codes must be 8–32 characters with max uses 1–100000." },
        { status: 400 },
      );
    }
    if (/admin_create_code|does not exist|schema cache|function .* not/i.test(msg)) {
      return NextResponse.json(
        { error: "VIP is not set up yet — run migration 0012." },
        { status: 503 },
      );
    }
    if (/duplicate|unique|already/i.test(msg)) {
      return NextResponse.json({ error: "That code already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create code." }, { status: 500 });
  }
  return NextResponse.json({ code }, { status: 201 });
}

import type { SupabaseClient } from "@supabase/supabase-js";

// SECURITY PHASE-2a session helpers. getAuthUser resolves session proof (via
// the anon-key auth client ONLY — never the service client, which cannot see
// user sessions); the pure rules below (linkDecision, normalizeRole,
// consentAllowed) are mirror-tested offline in scripts/test-auth.mjs.

// Cookie this auth flow re-asserts post-login. MUST match the private COOKIE
// in lib/game/player.ts ("arena_player_id") — duplicated (not imported)
// because player.ts owns the name and phase-2a adds no edits there; if the
// name ever changes, update both.
export const PLAYER_COOKIE_NAME = "arena_player_id";
// Short-lived stash for the signup role across the OTP email round-trip
// (written by /api/auth/otp, consumed+cleared by /auth/callback).
export const PENDING_ROLE_COOKIE = "arena_pending_role";

export type AuthUser = { id: string; email: string | null };

// Verified session -> {id, email}, else null. NEVER throws: no session,
// misconfigured Auth, and network failures all degrade to null (callers
// answer 401 / guest view, never 500 on identity).
export async function getAuthUser(authClient: SupabaseClient): Promise<AuthUser | null> {
  try {
    const { data, error } = await authClient.auth.getUser();
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

export type LinkDecision = "link-cookie" | "create-new" | "already-linked";

// Pure: which link path /auth/callback takes. Args coerce (cookie ids and
// link rows arrive as strings/objects, not booleans):
// - a link row already exists -> already-linked (re-login is idempotent)
// - signed cookie player, no link -> link-cookie (adopt the cookie player)
// - neither -> create-new (mint a fresh player, then link it)
export function linkDecision(hasCookiePlayer: unknown, hasExistingLink: unknown): LinkDecision {
  if (hasExistingLink) return "already-linked";
  if (hasCookiePlayer) return "link-cookie";
  return "create-new";
}

export const AUTH_ROLES = ["student", "parent", "teacher"] as const;
export type AuthRole = (typeof AUTH_ROLES)[number];

// Pure: validated auth_links role (?role= / pending cookie), else null.
// Unknown roles fail closed to null (the callback defaults those to student).
export function normalizeRole(raw: unknown): AuthRole | null {
  if (typeof raw !== "string") return null;
  return (AUTH_ROLES as readonly string[]).includes(raw) ? (raw as AuthRole) : null;
}

// Pure: consent gate — only a parent of THAT child may record consent. The
// route proves parenthood via families/family_members; this is the rule.
export function consentAllowed(isParentOfChild: unknown): boolean {
  return isParentOfChild === true;
}

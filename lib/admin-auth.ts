import { verifyAdmin } from "@/lib/game/player-sign";

// Shared admin-cookie check for admin API routes (same arena_admin cookie
// the /admin page verifies via verifyAdmin). Parses the raw Cookie header so
// it works on a bare Request. Returns false on any parse failure.
export function verifyAdminRequest(req: Request): boolean {
  try {
    const header = req.headers.get("cookie") ?? "";
    const m = header.match(/(?:^|;\s*)arena_admin=([^;]*)/);
    if (!m) return false;
    return verifyAdmin(decodeURIComponent(m[1]));
  } catch {
    return false;
  }
}

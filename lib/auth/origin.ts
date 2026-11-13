// Pinned site origin for auth redirects (sec-phase2a H3). Production MUST
// set NEXT_PUBLIC_SITE_URL (see .env.example): OTP email links, OAuth
// returns, and post-login/logout landings are built from this pinned origin,
// NEVER from the request Host header (Host is attacker-controlled, so
// Host-derived auth redirects are open-redirect-adjacent). Dev returns the
// request origin so localhost:PORT just works.
export function siteOrigin(req: Request): string {
  if (process.env.NODE_ENV === "production") {
    const raw = process.env.NEXT_PUBLIC_SITE_URL;
    if (!raw) throw new Error("server misconfigured");
    return new URL(raw).origin;
  }
  return new URL(req.url).origin;
}

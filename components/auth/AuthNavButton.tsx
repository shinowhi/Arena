"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Auth-aware nav link: shows the account page when a Supabase Auth session
// exists, else the login page. Renders the login link on FIRST paint (no
// empty placeholder — the button must be visible immediately, never pop in
// late) and upgrades to the account link once /api/auth/me confirms a
// session. Fail-soft: any fetch failure keeps login (the safe default — /me
// itself 401-guards). Same-origin fetch carries the sb-* session cookies by
// default; no credentials option needed.
export default function AuthNavButton({
  loginLabel,
  accountLabel,
  className = "",
}: {
  loginLabel: string;
  accountLabel: string;
  className?: string;
}) {
  // Default false (login) renders on the very first paint — there is no
  // loading state that withholds the button.
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { authed?: boolean } | null) => {
        if (alive && d?.authed === true) setAuthed(true);
      })
      .catch(() => {
        // Keep the login default (fail-soft; /me 401-guards anyway).
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Link href={authed ? "/me" : "/login"} className={className}>
      {authed ? accountLabel : loginLabel}
    </Link>
  );
}

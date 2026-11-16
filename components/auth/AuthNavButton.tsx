"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Auth-aware nav link: shows the account page when a Supabase Auth session
// exists, else the login page. Fail-soft: any fetch failure renders login
// (the safe default — /me itself 401-guards). Same-origin fetch carries the
// sb-* session cookies by default; no credentials option needed.
export default function AuthNavButton({
  loginLabel,
  accountLabel,
  className = "",
}: {
  loginLabel: string;
  accountLabel: string;
  className?: string;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { authed?: boolean } | null) => {
        if (alive) setAuthed(d?.authed === true);
      })
      .catch(() => {
        if (alive) setAuthed(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (authed === null) {
    // First paint: render nothing to avoid a login/account flicker.
    return <span aria-hidden="true" className={className} />;
  }
  return (
    <Link href={authed ? "/me" : "/login"} className={className}>
      {authed ? accountLabel : loginLabel}
    </Link>
  );
}

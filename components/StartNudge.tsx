"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadProfile } from "@/lib/profile/storage";
import { track } from "@/lib/tracking/events";

// Homepage nudge: shown only when no learner profile exists yet.
// Effect body runs in a microtask (repo lint: no sync setState in effect;
// same queueMicrotask pattern as app/scan/page.tsx).
export default function StartNudge() {
  const [mounted, setMounted] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (loadProfile() !== null) setHasProfile(true);
      setMounted(true);
    });
  }, []);

  if (!mounted || hasProfile) return null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4">
      <Link
        href="/start"
        onClick={() => track("start_nudge_clicked")}
        className="block rounded-2xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-center text-sm font-semibold text-cyan-200 transition-colors hover:border-cyan-300/70 hover:bg-cyan-400/15"
      >
        Mất 30 giây: cho Arena biết bạn là ai để vá đúng chỗ →
      </Link>
    </div>
  );
}
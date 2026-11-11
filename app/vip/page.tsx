import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { countToday, FREE_SCAN_DAILY, FREE_TUTOR_DAILY, getVipUntil, isVip } from "@/lib/vip";
import ClaimForm from "./claim-form";

// VIP hub (server component: status + usage render server-side; the claim
// form is the only client island). Read-only identity: unknown visitors see
// the free-tier view, no player is minted.
const UNLOCKS = [
  "Unlimited scans — no daily cap",
  "Unlimited tutor chats",
  "Unlimited essay grading",
  "Photo-problem papers (real-life boss mode)",
  "VIP badge on your profile",
];

function UsageBar({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  if (limit === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-zinc-300">{label}</span>
          <span className="font-semibold text-amber-300">Unlimited</span>
        </div>
      </div>
    );
  }
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="tabular-nums text-zinc-400">
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Module-level loader (kept out of the component so render stays pure).
async function loadStatus() {
  const playerId = await getPlayerId().catch(() => null);
  const supabase = await createClient();
  const vipUntil = playerId ? await getVipUntil(supabase, playerId) : null;
  const vip = playerId ? await isVip(supabase, playerId) : false;
  const scans = playerId ? await countToday(supabase, playerId, "scan_started") : 0;
  const tutor = playerId ? await countToday(supabase, playerId, "tutor_asked") : 0;
  return { vip, vipUntil, scans, tutor };
}

// Per-visitor status: reads cookies, so it must stream inside Suspense
// (Next 16 cacheComponents forbids dynamic reads during prerender).
async function VipStatus() {
  const { vip, vipUntil, scans, tutor } = await loadStatus();

  return (
    <>
      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        {vip ? (
          <>
            <p className="text-sm font-semibold text-amber-300">VIP active</p>
            <p className="mt-1 text-sm text-zinc-400">
              Your VIP lasts until {new Date(vipUntil as string).toLocaleDateString()}. Claiming
              another code extends it by 30 days.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-zinc-200">You are on the free plan</p>
            <p className="mt-1 text-sm text-zinc-400">
              Got a VIP code? Enter it below for 30 days of unlimited everything.
            </p>
          </>
        )}
        <ClaimForm />
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Today&apos;s usage</p>
        <div className="mt-3 space-y-4">
          <UsageBar used={scans} limit={vip ? null : FREE_SCAN_DAILY} label="Scans" />
          <UsageBar used={tutor} limit={vip ? null : FREE_TUTOR_DAILY} label="Tutor chats" />
        </div>
      </section>
    </>
  );
}

export default function VipPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">VIP</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">Go VIP</h1>

      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Loading your status…</p>}>
        <VipStatus />
      </Suspense>

      <section className="mt-6 rounded-2xl border border-amber-700/60 bg-amber-950/20 p-5">
        <p className="text-sm font-semibold text-amber-200">What VIP unlocks</p>
        <ul className="mt-3 space-y-1.5 text-sm text-zinc-300">
          {UNLOCKS.map((u) => (
            <li key={u} className="flex gap-2">
              <span className="text-amber-400">★</span>
              {u}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

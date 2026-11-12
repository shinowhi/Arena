import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlayerId } from "@/lib/game/player";
import { hasAccess } from "@/lib/billing/access";
import { REFUND_DAYS } from "@/lib/billing/plans";
import Paywall, { BillingClient } from "@/components/billing/Paywall";

// Billing hub (server shell + client islands). Static-safe: no cookies are
// read at the top level — the per-visitor paywall note streams inside
// Suspense (same pattern as /vip: Next 16 cacheComponents forbids dynamic
// reads during prerender), and all plans/order data loads client-side from
// the JSON APIs. Read-only identity: unknown visitors see the free-tier
// view, no player is minted.

// Per-visitor paywall note: reads cookies, so it must stream inside Suspense.
async function GateNote() {
  const playerId = await getPlayerId().catch(() => null);
  if (!playerId) return null;
  const supabase = await createClient();
  const [gateA, gateB] = await Promise.all([
    hasAccess(supabase, playerId, "A"),
    hasAccess(supabase, playerId, "B"),
  ]);
  if (gateA.ok && gateB.ok) return null;
  return (
    <div className="mt-6">
      <Paywall reason="paywall" />
    </div>
  );
}

export default function BillingPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Billing</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">Packs &amp; payment</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Your first 3 gap fixes are free. After that, pick a pack, transfer by bank with your memo,
        and your pack activates after the admin confirms payment — usually within 24h.
      </p>

      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Loading your status…</p>}>
        <GateNote />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading billing…</p>}>
          <BillingClient />
        </Suspense>
      </div>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">How manual payment works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
          <li>Create an order above and copy your memo (e.g. ARENA-X7KQ2P).</li>
          <li>Transfer the exact amount with the memo in the transfer note.</li>
          <li>Your pack unlocks after the admin confirms payment, usually within 24h.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Changed your mind? Refunds are available within {REFUND_DAYS} days of your first purchase
          — contact support with your memo. Have a VIP code instead?{" "}
          <Link href="/vip" className="underline hover:text-zinc-300">
            Claim it here
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

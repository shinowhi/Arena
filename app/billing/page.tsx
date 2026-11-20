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
      <div>
        <Suspense fallback={<p className="text-sm text-zinc-500">Đang tải thanh toán…</p>}>
          <BillingClient />
        </Suspense>
      </div>

      <p className="mt-6 text-xs font-bold tracking-widest text-amber-400">Thanh toán</p>
      <h1 className="mt-1 text-2xl font-extrabold text-zinc-100">Gói &amp; thanh toán</h1>
      <p className="mt-2 text-sm text-zinc-400">
        3 lần vá lỗ hổng đầu tiên miễn phí. Sau đó, bạn chọn gói, chuyển khoản kèm mã đơn,
        và gói sẽ mở sau khi quản trị xác nhận — thường trong 24 giờ.
      </p>

      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Đang tải trạng thái…</p>}>
        <GateNote />
      </Suspense>

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Thanh toán thủ công thế nào</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
          <li>Tạo đơn ở trên và chép mã đơn của bạn (vd. ARENA-X7KQ2P).</li>
          <li>Chuyển đúng số tiền, ghi mã đơn vào nội dung chuyển khoản.</li>
          <li>Gói sẽ mở sau khi quản trị xác nhận thanh toán, thường trong 24 giờ.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Đổi ý? Bạn được hoàn tiền trong {REFUND_DAYS} ngày từ lần mua đầu —
          liên hệ hỗ trợ kèm mã đơn. Có mã VIP?{" "}
          <Link href="/vip" className="underline hover:text-zinc-300">
            Nhận tại đây
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

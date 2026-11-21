"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { TrophyIcon } from "@/components/ui/icons";

// P4 slice-2 paywall surfaces (client). Paywall is the reason-aware upgrade
// card shown on gated surfaces; BillingClient is the interactive /billing
// island (VIP badge, plans grid, manual-transfer order form, own-orders
// status list). All data comes from the JSON APIs at runtime — no cookies
// read here, so the /billing server shell stays static-safe.

type Reason = "free" | "entitled" | "paywall";

const COPY: Record<Reason, { title: string; body: string }> = {
  paywall: {
    title: "Bạn đã vá xong 3 lỗ hổng miễn phí",
    body: "Giỏi lắm. Nâng cấp để vá tiếp và mở khóa trọn bộ đề thi thử — chuyển khoản thủ công, thường được kích hoạt trong 24 giờ.",
  },
  free: {
    title: "Vá 3 lỗ hổng đầu tiên miễn phí",
    body: "Vá miễn phí 3 lỗ hổng kỹ năng đầu tiên, rồi chọn gói để học tiếp. Không cần thẻ — thanh toán bằng chuyển khoản.",
  },
  entitled: {
    title: "Bạn đã được mở khóa",
    body: "Gói của bạn đang hoạt động. Cứ vá tiếp nhé — mỗi con boss bị hạ đều giúp bạn sẵn sàng hơn cho kỳ thi.",
  },
};

export default function Paywall({ reason = "paywall" }: { reason?: Reason }) {
  const copy = COPY[reason] ?? COPY.paywall;
  return (
    <section className="rounded-2xl border border-amber-700/60 bg-amber-950/20 p-5">
      <p className="text-xs font-semibold text-amber-400">Mở khóa không giới hạn</p>
      <h2 className="mt-1 text-xl font-extrabold text-zinc-100">{copy.title}</h2>
      <p className="mt-1 text-sm text-zinc-300">{copy.body}</p>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-zinc-100">
            Combo <span className="ml-1 rounded bg-amber-500 px-1.5 py-0.5 text-xs text-black">Nên chọn</span>
          </p>
          <p className="text-sm text-zinc-400">Mở khóa học tập + Gói thi thử — 49.000đ/tháng</p>
        </div>
        <Link
          href="/billing"
          className="arena-btn-primary inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-2 text-center text-sm font-bold text-white"
        >
          Xem các gói
        </Link>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Đã là VIP? <Link href="/vip" className="underline hover:text-zinc-300">Xem trạng thái</Link>
      </p>
    </section>
  );
}

type PlanRow = {
  code: string;
  name: string;
  product: string;
  price_vnd: number;
  period_days: number;
};

type OrderRow = {
  id: string;
  plan_code: string;
  amount_vnd: number;
  memo: string;
  status: string;
  created_at: string;
};

type OrderCreated = {
  order_id: string;
  memo: string;
  amount_vnd: number;
  plan: { code: string; name: string; product: string; period_days: number };
  transfer_note: string;
};

function formatVnd(n: number): string {
  return `${n.toLocaleString("vi-VN")}đ`;
}

function VipBadge() {
  const [vip, setVip] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/vip/status")
      .then((r) => r.json())
      .then((d) => {
        if (live) setVip(!!(d as { vip?: boolean }).vip);
      })
      .catch(() => {
        if (live) setVip(false);
      });
    return () => {
      live = false;
    };
  }, []);
  if (vip !== true) return null;
  return (
    <p className="flex items-center gap-2 rounded-xl border border-amber-700/60 bg-amber-950/20 px-4 py-2 text-sm font-semibold text-amber-300">
      <TrophyIcon className="h-4 w-4" />
      <span>
        VIP đang hoạt động — bạn đã mở khóa mọi thứ.{" "}
        <Link href="/vip" className="underline hover:text-amber-200">
          Xem trạng thái
        </Link>
      </span>
    </p>
  );
}

function PlansGrid({
  plans,
  loadError,
  onRetry,
  selected,
  onSelect,
}: {
  plans: PlanRow[] | null;
  loadError: boolean;
  onRetry: () => void;
  selected: string;
  onSelect: (code: string) => void;
}) {
  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-center">
        <p className="text-sm text-zinc-300">Không tải được các gói — kiểm tra mạng rồi thử lại nhé.</p>
        <button
          type="button"
          onClick={onRetry}
          className="arena-btn-ghost mt-2 inline-flex min-h-[44px] items-center rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
        >
          Thử lại
        </button>
      </div>
    );
  }
  if (plans === null) {
    return <p role="status" className="text-sm text-zinc-500">Đang tải các gói…</p>;
  }
  if (plans.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Chưa có gói nào — hệ thống thanh toán đang được thiết lập.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plans.map((p) => {
        const hero = p.code === "bundle_monthly";
        const active = selected === p.code;
        return (
          <button
            key={p.code}
            type="button"
            onClick={() => onSelect(p.code)}
            aria-pressed={active}
            className={`rounded-xl border p-4 text-left transition ${
              active
                ? "border-amber-500 bg-amber-950/20"
                : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600"
            }`}
          >
            <p className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              {p.name}
              {hero && (
                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs text-black">Nên chọn</span>
              )}
            </p>
            <p className="mt-1 text-lg font-extrabold text-amber-300">{formatVnd(p.price_vnd)}</p>
            <p className="text-xs text-zinc-500">
              {p.period_days} ngày — {p.product === "bundle" ? "Học tập + Thi thử" : p.product === "A" ? "Học tập" : "Thi thử"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function OrderForm({
  plans,
  planCode,
  setPlanCode,
}: {
  plans: PlanRow[];
  planCode: string;
  setPlanCode: (code: string) => void;
}) {
  const [payerRef, setPayerRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<OrderCreated | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !planCode) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_code: planCode, payer_ref: payerRef.trim() || undefined }),
      });
      const d = (await res.json().catch(() => null)) as (OrderCreated & { error?: string }) | null;
      if (!res.ok || !d?.memo) {
        setError(d?.error ?? "Không tạo được đơn hàng — hãy thử lại.");
      } else {
        setCreated(d);
      }
    } catch {
      setError("Không tạo được đơn hàng — hãy thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="plan" className="text-sm font-semibold text-zinc-200">
          1. Chọn gói
        </label>
        <select
          id="plan"
          value={planCode}
          onChange={(e) => setPlanCode(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        >
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name} — {formatVnd(p.price_vnd)} / {p.period_days} ngày
            </option>
          ))}
        </select>
        <label htmlFor="payer-ref" className="mt-2 text-sm font-semibold text-zinc-200">
          2. Nội dung chuyển khoản của bạn (không bắt buộc)
        </label>
        <input
          id="payer-ref"
          value={payerRef}
          onChange={(e) => setPayerRef(e.target.value)}
          placeholder="Số điện thoại / MoMo / tên ngân hàng để đối chiếu"
          autoComplete="off"
          maxLength={64}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={busy || !planCode}
          className="arena-btn-primary mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Đang tạo đơn hàng…" : "Tạo đơn hàng"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {created && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-700/60 bg-emerald-950/20 p-4">
          <p className="text-sm font-bold text-emerald-300">Đã tạo đơn — chuyển khoản để kích hoạt</p>
          <dl className="mt-2 space-y-1 text-sm text-zinc-300">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Số tiền</dt>
              <dd className="font-bold tabular-nums">{formatVnd(created.amount_vnd)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Mã đơn</dt>
              <dd className="font-mono font-bold">{created.memo}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-zinc-300">{created.transfer_note}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Trạng thái: chờ kích hoạt, thường trong 24 giờ. Giữ kỹ mã đơn — bộ phận hỗ trợ đối chiếu theo mã này.
          </p>
        </div>
      )}
    </div>
  );
}

function OrdersList() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/billing/orders")
      .then((r) => {
        if (!r.ok) throw new Error("orders failed");
        return r.json();
      })
      .then((d) => {
        if (!live) return;
        setLoadError(false);
        setOrders(Array.isArray((d as { orders?: unknown }).orders) ? (d as { orders: OrderRow[] }).orders : []);
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, [bump]);
  if (loadError) {
    return (
      <section role="alert" className="mt-6 rounded-2xl border border-red-800 bg-red-950/40 p-5 text-center">
        <p className="text-sm text-zinc-300">Không tải được đơn hàng — kiểm tra mạng rồi thử lại nhé.</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(false);
            setOrders(null);
            setBump((b) => b + 1);
          }}
          className="arena-btn-ghost mt-2 inline-flex min-h-[44px] items-center rounded-full px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white"
        >
          Thử lại
        </button>
      </section>
    );
  }
  if (orders === null) return <p role="status" className="text-sm text-zinc-500">Đang tải đơn hàng…</p>;
  if (orders.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="text-sm font-semibold text-zinc-200">Đơn hàng của bạn</h2>
      <ul className="mt-3 space-y-2">
        {orders.map((o) => (
          <li
            key={o.id}
            className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="font-mono text-zinc-200">{o.memo}</span>
            <span className="text-zinc-400">
              {o.plan_code} — <span className="tabular-nums">{formatVnd(o.amount_vnd)}</span>
            </span>
            <span
              className={
                o.status === "approved"
                  ? "font-semibold text-emerald-300"
                  : o.status === "rejected"
                    ? "font-semibold text-red-400"
                    : "font-semibold text-amber-300"
              }
            >
              {o.status === "pending" ? "chờ kích hoạt" : o.status === "approved" ? "đã duyệt" : o.status === "rejected" ? "bị từ chối" : o.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BillingPanels() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [plansError, setPlansError] = useState(false);
  const [plansBump, setPlansBump] = useState(0);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/billing/plans")
      .then((r) => {
        if (!r.ok) throw new Error("plans failed");
        return r.json();
      })
      .then((d) => {
        if (!live) return;
        const list = Array.isArray((d as { plans?: unknown }).plans)
          ? (d as { plans: PlanRow[] }).plans
          : [];
        setPlansError(false);
        setPlans(list);
        setSelected((s) => s || list.find((p) => p.code === "bundle_monthly")?.code || list[0]?.code || "");
      })
      .catch(() => {
        if (live) setPlansError(true);
      });
    return () => {
      live = false;
    };
  }, [plansBump]);

  function retryPlans() {
    setPlansError(false);
    setPlans(null);
    setPlansBump((b) => b + 1);
  }

  return (
    <div className="space-y-6">
      <VipBadge />
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-zinc-200">Các gói</h2>
        <div className="mt-3">
          <PlansGrid plans={plans} loadError={plansError} onRetry={retryPlans} selected={selected} onSelect={setSelected} />
        </div>
        {plans && plans.length > 0 && (
          <OrderForm plans={plans} planCode={selected} setPlanCode={setSelected} />
        )}
      </section>
      <OrdersList />
    </div>
  );
}

// Interactive island for /billing: wrapped in Suspense by the server shell.
export function BillingClient() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Đang tải thanh toán…</p>}>
      <BillingPanels />
    </Suspense>
  );
}

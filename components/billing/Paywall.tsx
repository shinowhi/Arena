"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";

// P4 slice-2 paywall surfaces (client). Paywall is the reason-aware upgrade
// card shown on gated surfaces; BillingClient is the interactive /billing
// island (VIP badge, plans grid, manual-transfer order form, own-orders
// status list). All data comes from the JSON APIs at runtime — no cookies
// read here, so the /billing server shell stays static-safe.

type Reason = "free" | "entitled" | "paywall";

const COPY: Record<Reason, { title: string; body: string }> = {
  paywall: {
    title: "You fixed your 3 free gaps",
    body: "Nice work. Upgrade to keep fixing gaps and unlock full exam packs — manual bank transfer, usually activated within 24 hours.",
  },
  free: {
    title: "3 free gap fixes",
    body: "Fix your first 3 skill gaps free, then pick a pack to keep going. No card needed — pay by bank transfer.",
  },
  entitled: {
    title: "You are unlocked",
    body: "Your pack is active. Keep fixing gaps — every slain boss counts toward exam readiness.",
  },
};

export default function Paywall({ reason = "paywall" }: { reason?: Reason }) {
  const copy = COPY[reason] ?? COPY.paywall;
  return (
    <section className="rounded-2xl border border-amber-700/60 bg-amber-950/20 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Go unlimited</p>
      <h2 className="mt-1 text-xl font-extrabold text-zinc-100">{copy.title}</h2>
      <p className="mt-1 text-sm text-zinc-300">{copy.body}</p>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-zinc-100">
            Bundle <span className="ml-1 rounded bg-amber-500 px-1.5 py-0.5 text-xs text-black">BEST</span>
          </p>
          <p className="text-sm text-zinc-400">Study Unlock + Exam Packs — 49,000 VND/month</p>
        </div>
        <Link
          href="/billing"
          className="rounded-lg bg-amber-500 px-5 py-2 text-center text-sm font-bold text-black hover:bg-amber-400"
        >
          See plans
        </Link>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Already VIP? <Link href="/vip" className="underline hover:text-zinc-300">Check your status</Link>
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
  return `${n.toLocaleString("en-US")} VND`;
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
    <p className="rounded-xl border border-amber-700/60 bg-amber-950/20 px-4 py-2 text-sm font-semibold text-amber-300">
      ★ VIP active — you already unlock everything.{" "}
      <Link href="/vip" className="underline hover:text-amber-200">
        View status
      </Link>
    </p>
  );
}

function PlansGrid({
  plans,
  selected,
  onSelect,
}: {
  plans: PlanRow[] | null;
  selected: string;
  onSelect: (code: string) => void;
}) {
  if (plans === null) {
    return <p className="text-sm text-zinc-500">Loading plans…</p>;
  }
  if (plans.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Plans are not available yet — billing setup is still in progress.
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
                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs text-black">BEST</span>
              )}
            </p>
            <p className="mt-1 text-lg font-extrabold text-amber-300">{formatVnd(p.price_vnd)}</p>
            <p className="text-xs text-zinc-500">
              {p.period_days} days · {p.product === "bundle" ? "Study + Exams" : p.product === "A" ? "Study" : "Exams"}
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
        setError(d?.error ?? "Could not create order — retry.");
      } else {
        setCreated(d);
      }
    } catch {
      setError("Could not create order — retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="plan" className="text-sm font-semibold text-zinc-200">
          1. Pick a plan
        </label>
        <select
          id="plan"
          value={planCode}
          onChange={(e) => setPlanCode(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        >
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name} — {formatVnd(p.price_vnd)} / {p.period_days}d
            </option>
          ))}
        </select>
        <label htmlFor="payer-ref" className="mt-2 text-sm font-semibold text-zinc-200">
          2. Your transfer note (optional)
        </label>
        <input
          id="payer-ref"
          value={payerRef}
          onChange={(e) => setPayerRef(e.target.value)}
          placeholder="Phone / MoMo / bank name for manual matching"
          autoComplete="off"
          maxLength={64}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={busy || !planCode}
          className="mt-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Creating order…" : "Create order"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      {created && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-700/60 bg-emerald-950/20 p-4">
          <p className="text-sm font-bold text-emerald-300">Order created — transfer to activate</p>
          <dl className="mt-2 space-y-1 text-sm text-zinc-300">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Amount</dt>
              <dd className="font-bold tabular-nums">{formatVnd(created.amount_vnd)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Memo</dt>
              <dd className="font-mono font-bold">{created.memo}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-zinc-300">{created.transfer_note}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Status: awaiting activation, usually within 24h. Keep your memo — support matches by it.
          </p>
        </div>
      )}
    </div>
  );
}

function OrdersList() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/billing/orders")
      .then((r) => r.json())
      .then((d) => {
        if (live) setOrders(Array.isArray((d as { orders?: unknown }).orders) ? (d as { orders: OrderRow[] }).orders : []);
      })
      .catch(() => {
        if (live) setOrders([]);
      });
    return () => {
      live = false;
    };
  }, []);
  if (orders === null) return <p className="text-sm text-zinc-500">Loading your orders…</p>;
  if (orders.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <p className="text-sm font-semibold text-zinc-200">Your orders</p>
      <ul className="mt-3 space-y-2">
        {orders.map((o) => (
          <li
            key={o.id}
            className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="font-mono text-zinc-200">{o.memo}</span>
            <span className="text-zinc-400">
              {o.plan_code} · <span className="tabular-nums">{formatVnd(o.amount_vnd)}</span>
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
              {o.status === "pending" ? "awaiting activation" : o.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BillingPanels() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/billing/plans")
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        const list = Array.isArray((d as { plans?: unknown }).plans)
          ? (d as { plans: PlanRow[] }).plans
          : [];
        setPlans(list);
        setSelected((s) => s || list.find((p) => p.code === "bundle_monthly")?.code || list[0]?.code || "");
      })
      .catch(() => {
        if (live) setPlans([]);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <VipBadge />
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm font-semibold text-zinc-200">Plans</p>
        <div className="mt-3">
          <PlansGrid plans={plans} selected={selected} onSelect={setSelected} />
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
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading billing…</p>}>
      <BillingPanels />
    </Suspense>
  );
}

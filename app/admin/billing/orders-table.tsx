"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Minimal client island: pending-order approve/reject buttons. PATCHes
// /api/admin/orders (cookie-authenticated) and refreshes the server-rendered
// page on success. Server owns all data; this island only sends decisions.
export type PendingOrder = {
  id: string;
  player_id: string;
  plan_code: string;
  amount_vnd: number;
  memo: string;
  created_at: string;
  payer_ref: string | null;
  device_id: string | null;
};

export default function OrdersTable({ orders }: { orders: PendingOrder[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function decide(orderId: string, action: "approve" | "reject") {
    if (busy) return;
    setBusy(orderId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, action }),
      });
      const d = (await res.json().catch(() => null)) as {
        order_id?: string;
        subscription_id?: string;
        error?: string;
      } | null;
      if (!res.ok || !d?.order_id) {
        setMsg({ ok: false, text: d?.error ?? `Could not ${action} order.` });
      } else {
        setMsg({
          ok: true,
          text:
            action === "approve"
              ? `Approved — subscription ${String(d.subscription_id).slice(0, 8)}…`
              : "Rejected.",
        });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: `Could not ${action} order.` });
    } finally {
      setBusy(null);
    }
  }

  if (orders.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">No pending orders.</p>;
  }
  return (
    <div className="mt-3 overflow-auto">
      {msg && (
        <p className={`mb-3 text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>{msg.text}</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="py-1 font-semibold">Time</th>
            <th className="py-1 font-semibold">Memo</th>
            <th className="py-1 font-semibold">Payer ref</th>
            <th className="py-1 font-semibold">Device</th>
            <th className="py-1 font-semibold">Plan</th>
            <th className="py-1 text-right font-semibold">Amount</th>
            <th className="py-1 font-semibold">Player</th>
            <th className="py-1 text-right font-semibold">Decision</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-zinc-800 text-zinc-300">
              <td className="whitespace-nowrap py-1.5 pr-2 text-xs tabular-nums">
                {new Date(o.created_at).toISOString().slice(0, 19).replace("T", " ")}
              </td>
              <td className="py-1.5 pr-2 font-mono text-xs">{o.memo}</td>
              <td className="max-w-32 truncate py-1.5 pr-2 font-mono text-xs">{o.payer_ref ?? "—"}</td>
              <td className="max-w-24 truncate py-1.5 pr-2 font-mono text-xs text-zinc-500">
                {o.device_id ? `${o.device_id.slice(0, 8)}…` : "—"}
              </td>
              <td className="py-1.5 pr-2 font-mono text-xs">{o.plan_code}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {Number(o.amount_vnd).toLocaleString("en-US")}
              </td>
              <td className="py-1.5 pr-2 font-mono text-xs">{o.player_id.slice(0, 8)}…</td>
              <td className="py-1.5 text-right">
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => decide(o.id, "approve")}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Approve
                </button>{" "}
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => decide(o.id, "reject")}
                  className="rounded-lg bg-zinc-700 px-3 py-1 text-xs font-bold text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
                >
                  Reject
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

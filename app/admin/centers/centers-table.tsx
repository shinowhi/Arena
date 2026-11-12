"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Minimal client island: class status toggles. PATCHes /api/admin/centers
// (cookie-authenticated) and refreshes the server-rendered page on success.
// Server owns all data; this island only sends status decisions.
export type CenterClass = {
  id: string;
  center_id: string | null;
  name: string;
  teacher_player_id: string;
  plan_code: string;
  seats: number;
  enrolled: number;
  status: string;
  join_code: string;
  created_at: string;
};

type Status = "pending" | "active" | "expired" | "cancelled";

const NEXT: Record<string, Status[]> = {
  pending: ["active", "cancelled"],
  active: ["expired", "cancelled"],
  expired: ["active", "cancelled"],
  cancelled: ["active"],
};

export default function CentersTable({
  classes,
  centerName,
}: {
  classes: CenterClass[];
  centerName: Record<string, string>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function setStatus(classId: string, status: Status) {
    if (busy) return;
    setBusy(classId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/centers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: classId, status }),
      });
      const d = (await res.json().catch(() => null)) as { status?: string; error?: string } | null;
      if (!res.ok || !d?.status) {
        setMsg({ ok: false, text: d?.error ?? "Could not update status." });
      } else {
        setMsg({ ok: true, text: `Class is now ${d.status}.` });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Could not update status." });
    } finally {
      setBusy(null);
    }
  }

  if (classes.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">No classes yet.</p>;
  }
  return (
    <div className="mt-3 overflow-auto">
      {msg && (
        <p className={`mb-3 text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>{msg.text}</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="py-1 font-semibold">Class</th>
            <th className="py-1 font-semibold">Center</th>
            <th className="py-1 font-semibold">Code</th>
            <th className="py-1 text-right font-semibold">Seats</th>
            <th className="py-1 font-semibold">Status</th>
            <th className="py-1 text-right font-semibold">Set</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id} className="border-t border-zinc-800 text-zinc-300">
              <td className="py-1.5 pr-2">
                <p className="font-semibold">{c.name}</p>
                <p className="font-mono text-xs text-zinc-500">
                  {c.plan_code} · teacher {c.teacher_player_id.slice(0, 8)}…
                </p>
              </td>
              <td className="py-1.5 pr-2 text-xs">
                {c.center_id ? (centerName[c.center_id] ?? "—") : "—"}
              </td>
              <td className="py-1.5 pr-2 font-mono text-xs">{c.join_code}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {c.enrolled} / {c.seats}
              </td>
              <td className="py-1.5 pr-2 text-xs font-bold">{c.status}</td>
              <td className="py-1.5 text-right">
                <span className="inline-flex gap-1">
                  {(NEXT[c.status] ?? (["active"] as Status[])).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => setStatus(c.id, s)}
                      className="rounded-lg bg-zinc-700 px-2 py-1 text-xs font-bold text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

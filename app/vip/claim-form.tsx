"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Minimal client island: VIP code claim form. Posts to /api/vip/claim and
// refreshes the server-rendered status card on success.
export default function ClaimForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/vip/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = (await res.json().catch(() => null)) as { vip_until?: string; error?: string } | null;
      if (!res.ok || !d?.vip_until) {
        setMsg({ ok: false, text: d?.error ?? "Nhận mã thất bại — thử lại." });
      } else {
        setCode("");
        setMsg({ ok: true, text: `VIP đến ${new Date(d.vip_until).toLocaleDateString("vi-VN")}.` });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Nhận mã thất bại — thử lại." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <label htmlFor="vip-code" className="sr-only">
        Mã VIP
      </label>
      <input
        id="vip-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Nhập mã VIP của bạn"
        autoComplete="off"
        maxLength={32}
        className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? "Đang nhận…" : "Nhận VIP"}
      </button>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

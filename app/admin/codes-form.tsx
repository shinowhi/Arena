"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Minimal client island: VIP code creation form. Posts JSON to
// /api/admin/codes (cookie-authenticated) and refreshes the server-rendered
// inventory on success. Empty code => server auto-generates one.
export default function CodesForm() {
  const [code, setCode] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(code.trim() ? { code: code.trim() } : {}),
          max_uses: Math.max(1, Math.floor(Number(maxUses) || 1)),
          expires_at: expires ? new Date(`${expires}T00:00:00Z`).toISOString() : null,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const d = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
      if (!res.ok || !d?.code) {
        setMsg({ ok: false, text: d?.error ?? "Không tạo được mã." });
      } else {
        setCode("");
        setMaxUses("1");
        setExpires("");
        setNote("");
        setMsg({ ok: true, text: `Đã tạo mã ${d.code}.` });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Không tạo được mã." });
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600";
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block text-xs text-zinc-400">
        Mã (để trống = tự tạo)
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={32}
          autoComplete="off"
          placeholder="vd. LAUNCH-100"
          className={input}
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Số lượt dùng tối đa
        <input
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          inputMode="numeric"
          className={input}
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Hết hạn (không bắt buộc)
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          className={input}
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Ghi chú (không bắt buộc)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="vd. đợt mở bán"
          className={input}
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Đang tạo…" : "Tạo mã"}
        </button>
        {msg && (
          <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}

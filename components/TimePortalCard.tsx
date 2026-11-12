"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { skillGrade, skillGradeLabel, skillName } from "@/lib/graph/skills";

// Shows only when the root cause comes from an older grade than the weak skill.
// Mount on the scan result: <TimePortalCard weak={gap.weak_skill} root={gap.root_cause} />
export default function TimePortalCard({ weak, root }: { weak: string; root: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  if (!root || root === weak || skillGrade(root) >= skillGrade(weak)) return null;

  async function enter() {
    setBusy(true);
    setError("");
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 180000);
      try {
        const r = await fetch("/api/boss/summon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill_tag: root }),
          signal: ctrl.signal,
        });
        const d = await r.json();
        if (!d.boss_id) throw new Error(d.error ?? "Gọi boss thất bại.");
        router.push(`/boss/${encodeURIComponent(d.boss_id)}?root=${encodeURIComponent(root)}`);
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      setError(e instanceof Error && e.name === "AbortError" ? "Hết giờ — tải lại để xem boss mới nhất rồi thử lại." : "Mở cổng thất bại. Thử lại.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-cyan-400/50 bg-cyan-950/60 p-4 text-center">
      <p className="text-lg font-bold text-cyan-300">🌀 Cổng thời gian đã mở</p>
      <p className="mt-1 text-sm text-cyan-100">
        Điểm yếu này bắt nguồn từ {skillGradeLabel(root)}: {skillName(root)}.
        Vá quá khứ để sửa hiện tại.
      </p>
      <button
        onClick={enter}
        disabled={busy}
        className="mt-3 rounded-lg bg-cyan-400 px-5 py-2 font-semibold text-black disabled:opacity-50"
      >
        {busy ? "Đang mở cổng…" : `Vào cổng → mini-boss ${skillGradeLabel(root)}`}
      </button>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
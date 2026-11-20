"use client";

import { useEffect, useState } from "react";
import Stat from "@/components/ui/Stat";
import PageHeader from "@/components/ui/PageHeader";
import { CheckIcon, GiftIcon } from "@/components/ui/icons";

interface Stats {
  scans: number;
  skillsSlain: number;
  streakDays: number;
  activeDays: number;
  topWeak: { id: string; name: string; misses: number } | null;
}
type Report =
  | { role: "parent"; stats: Stats }
  | { role: "child"; linked: boolean; stats: Stats }
  | { role: "none"; stats: Stats };

function StatCard({ label, value }: { label: string; value: string | number }) {
  return <Stat label={label} value={value} />;
}

export default function ParentPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [code, setCode] = useState("");
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/parent/report");
        const data = (await res.json().catch(() => null)) as (Report & { needsMigration?: boolean }) | null;
        if (!alive || !data) return;
        if (data.needsMigration) {
          setNeedsMigration(true);
          return;
        }
        if ("role" in data) setReport(data);
      } catch {
        if (alive) setMsg("Không tải được báo cáo. Kiểm tra mạng rồi tải lại nhé.");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [bump]);

  async function mintCode() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/parent/link-code", { method: "POST" });
      const data = (await res.json()) as { code?: string; error?: string; needsMigration?: boolean };
      if (data.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok || !data.code) throw new Error(data.error ?? "Không tạo được mã.");
      setCode(data.code);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Không tạo được mã.");
    } finally {
      setBusy(false);
    }
  }

  async function claimCode() {
    if (busy || !claim.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/parent/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: claim.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; needsMigration?: boolean };
      if (data.needsMigration) {
        setNeedsMigration(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Liên kết thất bại.");
      setClaim("");
      setMsg("Đã liên kết! Thiết bị này xem được báo cáo của con.");
      setBump((b) => b + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Liên kết thất bại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader
        kicker="Cho phụ huynh"
        title="Báo cáo phụ huynh"
        sub="Liên kết thiết bị của phụ huynh bằng mã dùng một lần — không cần tài khoản, không cần email. Phụ huynh chỉ xem được con số tiến độ, không bao giờ xem đáp án."
      />

      {needsMigration && (
        <div className="mt-4 rounded-xl border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          Liên kết phụ huynh cần cập nhật cơ sở dữ liệu (migration 0005) — nhờ chủ web chạy trong
          Supabase. Các con số bên dưới vẫn xem được.
        </div>
      )}

      {report?.role === "parent" && (
        <section className="mt-6 rounded-2xl border border-emerald-800 bg-emerald-950/30 p-5">
          <h2 className="text-sm font-semibold text-emerald-300">Tiến độ của con</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Bài đã quét" value={report.stats.scans} />
            <StatCard label="Kỹ năng đã chinh phục" value={report.stats.skillsSlain} />
            <StatCard label="Chuỗi ngày" value={report.stats.streakDays} />
            <StatCard label="Ngày hoạt động" value={report.stats.activeDays} />
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-sm tabular-nums text-zinc-300">
            {report.stats.topWeak ? (
              <>Cần giúp nhất ở: <strong className="text-amber-300">{report.stats.topWeak.name}</strong> (còn {report.stats.topWeak.misses} câu sai).</>
            ) : (
              <>Hiện không còn điểm yếu nào — mọi kỹ năng yếu đã được chinh phục. <GiftIcon className="h-4 w-4 text-amber-300" /></>
            )}
          </p>
        </section>
      )}

      {(report?.role === "child" || report?.role === "none") && (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Bạn là học sinh?</h2>
          {report.role === "child" && report.linked ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-300">
              <CheckIcon className="h-4 w-4" /> Đã liên kết thiết bị của phụ huynh — phụ huynh xem được các con số tiến độ của bạn.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-400">
                Tạo mã dùng một lần, rồi nhập mã đó trên thiết bị của phụ huynh ở dưới.
              </p>
              <button
                onClick={mintCode}
                disabled={busy || needsMigration}
                className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {busy ? "Đang tạo…" : "Tạo mã liên kết"}
              </button>
              {code && (
                <p className="mt-3 text-center text-4xl font-black tracking-[0.3em] text-amber-300">
                  {code}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {report?.role !== "parent" && (
        <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-200">Bạn là phụ huynh?</h2>
          <p className="mt-1 text-sm text-zinc-400">Nhập mã trên thiết bị của con:</p>
          <div className="mt-2 flex gap-2">
            <input
              value={claim}
              onChange={(e) => setClaim(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={12}
              aria-label="Mã liên kết phụ huynh"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-lg font-bold tracking-[0.2em] text-zinc-100"
            />
            <button
              onClick={claimCode}
              disabled={busy || needsMigration || !claim.trim()}
              className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              Liên kết
            </button>
          </div>
        </section>
      )}

      {msg && <p role="status" className="mt-3 text-sm text-amber-300">{msg}</p>}

      {report && report.role !== "parent" && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-zinc-300">Con số của bạn</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Lượt quét" value={report.stats.scans} />
            <StatCard label="Kỹ năng đã hạ" value={report.stats.skillsSlain} />
            <StatCard label="Chuỗi" value={report.stats.streakDays} />
            <StatCard label="Ngày hoạt động" value={report.stats.activeDays} />
          </div>
        </section>
      )}
    </main>
  );
}

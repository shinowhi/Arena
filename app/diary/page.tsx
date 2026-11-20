"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { HeroList } from "@/components/ui/Hero";
import { CheckIcon } from "@/components/ui/icons";

type Entry = {
  skill: string;
  name: string;
  fails: number;
  hits: number;
  slainAt: string | null;
  patched: boolean;
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
}

export default function DiaryPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/diary")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Load failed.");
        setEntries(d.entries as Entry[]);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HeroList
        count={entries ? entries.filter((e) => e.patched).length : "…"}
        label={entries ? `gốc đã vá trên ${entries.length} trận đã đánh` : "Đang mở nhật ký…"}
        action={
          <Link href="/scan" className="arena-btn-ghost rounded-full px-4 py-1.5 text-xs font-semibold text-zinc-200">
            Quét bài mới
          </Link>
        }
      />
      <PageHeader
        kicker="Nhật ký gốc"
        title="Mọi gốc rễ bạn đã vá"
        sub="Lịch sử trận đánh của bạn, theo từng kỹ năng."
      />
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      {!entries && !error ? <p className="text-zinc-500">Đang mở nhật ký…</p> : null}
      {entries && entries.length === 0 ? (
        <p className="text-zinc-500">Chưa đánh trận nào. Hạ boss đầu tiên, trận đó sẽ nằm ở đây.</p>
      ) : null}
      {entries && entries.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.skill} className="arena-card flex items-start gap-3 rounded-2xl p-4">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  e.patched ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                }`}
              >
                {e.patched ? <CheckIcon className="h-4 w-4" /> : <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />}
              </span>
              <div>
                <h2 className="font-semibold text-zinc-100">{e.name}</h2>
                <p className="text-sm tabular-nums text-zinc-400">
                  {e.patched && e.slainAt
                    ? `${shortDate(e.slainAt)}: hạ được ${
                        e.fails > 0 ? `sau ${e.fails} lần trượt` : "ngay lần đầu — không trượt phát nào!"
                      }`
                    : `Đang đánh — đã trúng ${e.hits} đòn.`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <nav className="flex gap-4 text-sm">
        <Link href="/streak" className="underline text-zinc-300 hover:text-white">
          Chuỗi của bạn
        </Link>
        <Link href="/scan" className="underline text-zinc-300 hover:text-white">
          Quét bài mới
        </Link>
      </nav>
    </main>
  );
}

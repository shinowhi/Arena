"use client";

import { useEffect, useState } from "react";

type Hit = {
  damage: number;
  created_at: string;
  player_id: string;
  players: { display_name: string | null } | null;
};

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + " giây trước";
  return Math.floor(s / 60) + " phút trước";
}

// Live raid feed for a shared boss. Hidden until migration 0004 is run.
// Mount on the boss fight screen: <RaidFeed bossId={boss.id} />
export default function RaidFeed({ bossId }: { bossId: string }) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [me, setMe] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    // SECURITY PHASE-1: 2s polling of /api/boss/[id]/raid-hits replaces the
    // direct anon read + realtime subscription (revoked in migration 0019).
    // Fail-soft: errors keep the last hits; an initial error leaves hits
    // null = feed stays hidden (same as the old table-missing check).
    const load = () => {
      fetch("/api/boss/" + bossId + "/raid-hits")
        .then(async (r) => {
          if (!r.ok) return;
          const d = (await r.json()) as { hits?: Hit[] };
          if (!stop && Array.isArray(d.hits)) setHits(d.hits);
        })
        .catch(() => {});
    };
    load();
    fetch("/api/player")
      .then((r) => r.json())
      .then((d) => {
        if (!stop && d.id) setMe(d.id as string);
      })
      .catch(() => {});
    const poll = setInterval(load, 2000);
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(t);
    };
  }, [bossId]);

  async function copyRaid() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Chép link raid của bạn:", link);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!hits) return null;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-widest text-orange-300">Nhật ký raid</h2>
        <button onClick={copyRaid} className="inline-flex min-h-[44px] items-center rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800">
          {copied ? "Đã chép link!" : "Chép link raid"}
        </button>
      </div>
      {hits.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Chưa có đòn nào — hãy ra đòn đầu tiên.</p>
      ) : (
        <ul className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto text-sm">
          {hits.map((h, i) => (
            <li key={h.created_at + i} className="text-zinc-300">
              <span className="font-semibold text-zinc-100">
                {h.player_id === me ? "Bạn" : (h.players?.display_name ?? "Thợ săn #" + h.player_id.slice(0, 4))}
              </span>{" "}
              chém {h.damage} HP <span className="text-zinc-500 tabular-nums">— {ago(h.created_at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
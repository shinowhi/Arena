"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Hit = {
  damage: number;
  created_at: string;
  player_id: string;
  players: { display_name: string | null } | null;
};

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  return Math.floor(s / 60) + "m ago";
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
    const supabase = createClient();
    const load = () => {
      supabase
        .from("raid_hits")
        .select("damage, created_at, player_id, players(display_name)")
        .eq("boss_id", bossId)
        .order("created_at", { ascending: false })
        .limit(15)
        .then(({ data, error }) => {
          if (!stop && !error) setHits(((data as unknown) as Hit[]) ?? []);
        });
    };
    // Table-missing check: any error leaves hits null = feed stays hidden.
    supabase
      .from("raid_hits")
      .select("id", { head: true, count: "exact" })
      .then(({ error }) => {
        if (!stop && !error) load();
      });
    fetch("/api/player")
      .then((r) => r.json())
      .then((d) => {
        if (!stop && d.id) setMe(d.id as string);
      })
      .catch(() => {});
    const ch = supabase
      .channel("raid-" + bossId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "raid_hits", filter: `boss_id=eq.${bossId}` }, load)
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      stop = true;
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, [bossId]);

  async function copyRaid() {
    const link = window.location.href;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy your raid link:", link);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!hits) return null;
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-widest text-orange-300 uppercase">Raid feed</p>
        <button onClick={copyRaid} className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-200">
          {copied ? "Link copied!" : "Copy raid link"}
        </button>
      </div>
      {hits.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No slashes yet — land the first hit.</p>
      ) : (
        <ul className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto text-sm">
          {hits.map((h, i) => (
            <li key={h.created_at + i} className="text-zinc-300">
              <span className="font-semibold text-zinc-100">
                {h.player_id === me ? "You" : (h.players?.display_name ?? "Hunter #" + h.player_id.slice(0, 4))}
              </span>{" "}
              slashed {h.damage} HP <span className="text-zinc-500">· {ago(h.created_at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
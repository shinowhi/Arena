"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { skillName } from "@/lib/graph/skills";
import HpBar from "@/components/HpBar";

type BossCard = {
  id: string;
  skill_tag: string;
  rarity: string;
  is_world: boolean;
  despawn_at: string;
  max_hp: number;
  current_hp: number;
  status: string;
};

function fmt(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
}

export default function ArenaPage() {
  const [bosses, setBosses] = useState<BossCard[] | null>(null);
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));

  useEffect(() => {
    let stop = false;
    fetch("/api/arena/active-bosses")
      .then((r) => r.json())
      .then((d) => {
        if (!stop) setBosses(d.bosses ?? []);
      })
      .catch(() => {
        if (!stop) setBosses([]);
      });
    const supabase = createClient();
    const ch = supabase
      .channel("bosses-hp")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bosses" }, (payload) => {
        const row = payload.new as { id: string; current_hp: number; status: string };
        setBosses((prev) =>
          prev ? prev.map((b) => (b.id === row.id ? { ...b, current_hp: row.current_hp, status: row.status } : b)) : prev,
        );
      })
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Arena</h1>
        <a href="/scan" className="text-sm underline">
          Scan work
        </a>
      </div>
      {bosses === null ? (
        <p>Loading arena — first visit summons today&apos;s World Boss from the most-missed skill (~30s)…</p>
      ) : bosses.length === 0 ? (
        <p>No live bosses. Scan your work to summon one.</p>
      ) : (
        bosses.map((b) => {
          const left = new Date(b.despawn_at).getTime() - now;
          return (
            <a key={b.id} href={"/boss/" + b.id} className="flex flex-col gap-2 rounded-lg border p-4 hover:bg-zinc-50">
              <div className="flex items-baseline justify-between">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {b.is_world ? "World Boss: " : "Boss: "}
                  {skillName(b.skill_tag)}
                  {b.rarity !== "COMMON" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      {b.rarity}
                    </span>
                  ) : null}
                  {b.is_world ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                      <span className="arena-livedot" />
                      LIVE · shared HP
                    </span>
                  ) : null}
                </p>
                <span className="text-sm tabular-nums text-zinc-500">{fmt(left)}</span>
              </div>
              <HpBar current={b.current_hp} max={b.max_hp} />
              <p className="text-sm text-zinc-600">
                HP {b.current_hp}/{b.max_hp} — {b.status}
              </p>
            </a>
          );
        })
      )}
    </main>
  );
}



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
  const [playerId, setPlayerId] = useState("");
  const [xp, setXp] = useState(0);
  const [inviteMsg, setInviteMsg] = useState("");
  const [copied, setCopied] = useState(false);

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
    fetch("/api/player")
      .then((r) => r.json())
      .then((d) => {
        if (stop || !d.id) return;
        setPlayerId(d.id as string);
        setXp((d.xp as number) ?? 0);
        const code = new URLSearchParams(window.location.search).get("invite");
        if (code && code !== d.id) {
          fetch("/api/invite/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviter_id: code }),
          })
            .then((r) => r.json())
            .then((c) => {
              if (stop) return;
              if (c.awarded) {
                setXp(c.xp as number);
                setInviteMsg("You joined via invite — +50 XP for both of you!");
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
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

  async function copyInvite() {
    if (!playerId) return;
    const link = window.location.origin + "/arena?invite=" + playerId;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy your invite link:", link);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <div className="arena-enter flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-red-400 uppercase">Live battlefield</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            The <span className="arena-title">Arena</span>
          </h1>
          {playerId ? (
            <p className="mt-1 inline-block rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-0.5 text-xs font-semibold text-zinc-300">
              Lv {Math.floor(xp / 100) + 1} · {xp} XP
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={copyInvite}
            disabled={!playerId}
            title="Both of you get +50 XP"
            className="arena-btn-ghost rounded-full px-4 py-2 text-sm font-medium text-zinc-200 disabled:opacity-40"
          >
            {copied ? "Link copied!" : "Invite friends"}
          </button>
          <a href="/scan" className="arena-btn-ghost rounded-full px-4 py-2 text-sm font-medium text-zinc-200">
            + Scan
          </a>
        </div>
      </div>
      {inviteMsg ? (
        <p className="arena-pop rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-2 text-sm font-medium text-emerald-200">
          {inviteMsg}
        </p>
      ) : null}
      {bosses === null ? (
        <div className="flex flex-col gap-3">
          <div className="arena-shimmer h-28 rounded-2xl" />
          <div className="arena-shimmer h-28 rounded-2xl" />
          <p className="text-sm text-zinc-500">Loading arena — first visit summons today&apos;s World Boss (~30s)…</p>
        </div>
      ) : bosses.length === 0 ? (
        <div className="arena-card rounded-2xl p-8 text-center">
          <p className="text-lg font-bold">No live bosses.</p>
          <p className="mt-1 text-sm text-zinc-400">Scan your work to summon one.</p>
          <a href="/scan" className="arena-btn-primary mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            Scan now
          </a>
        </div>
      ) : (
        bosses.map((b, i) => {
          const left = new Date(b.despawn_at).getTime() - now;
          const urgent = left < 60000 && b.status === "ALIVE";
          return (
            <a
              key={b.id}
              href={"/boss/" + b.id}
              className={`arena-enter arena-card group flex flex-col gap-3 rounded-2xl p-5 transition-all hover:-translate-y-0.5 ${i === 1 ? "arena-d1" : i === 2 ? "arena-d2" : ""} ${b.is_world ? "border-red-900 shadow-[0_0_32px_rgba(239,68,68,0.25)] hover:shadow-[0_0_44px_rgba(239,68,68,0.4)]" : "hover:border-zinc-600"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {b.is_world ? "World Boss: " : "Boss: "}
                  {skillName(b.skill_tag)}
                  {b.rarity !== "COMMON" ? (
                    <span className="rounded-full border border-amber-500/60 bg-amber-950/60 px-2 py-0.5 text-xs font-bold text-amber-200">
                      {b.rarity}
                    </span>
                  ) : null}
                  {b.is_world ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <span className="arena-livedot" />
                      LIVE · shared HP
                    </span>
                  ) : null}
                </p>
                <span className={`shrink-0 font-mono text-sm tabular-nums ${urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
                  {fmt(left)}
                </span>
              </div>
              <HpBar current={b.current_hp} max={b.max_hp} />
              <p className="text-sm text-zinc-400">
                HP {b.current_hp}/{b.max_hp} — {b.status}
                <span className="ml-2 text-zinc-600 transition-colors group-hover:text-red-400">Fight →</span>
              </p>
            </a>
          );
        })
      )}
    </main>
  );
}
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { skillName } from "@/lib/graph/skills";
import HpBar from "@/components/HpBar";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import CharRig from "@/components/CharRig";
import AvatarBuilder from "@/components/AvatarBuilder";
import BossAvatar from "@/components/BossAvatar";
import { DEFAULT_AVATAR, loadAvatar, saveAvatar, type AvatarSpec } from "@/lib/game/avatar";

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

type Leader = { id: string; name: string; xp: number; level: number; bosses_slain: number };

type Rush = { reset_at: string; boss: BossCard };
type RushRank = { id: string; name: string; solved: number; time: string };


function fmt(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
}

// Display-only Vietnamese labels for API enum values (raw value kept as fallback).
const RARITY_LABEL: Record<string, string> = {
  ELITE: "Tinh anh",
  LEGENDARY: "Huyền thoại",
};
const BOSS_STATUS_LABEL: Record<string, string> = {
  ALIVE: "Đang đánh",
};

export default function ArenaPage() {
  const [bosses, setBosses] = useState<BossCard[] | null>(null);
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));
  const [playerId, setPlayerId] = useState("");
  const [xp, setXp] = useState(0);
  const [inviteMsg, setInviteMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [avatar, setAvatar] = useState<AvatarSpec>(DEFAULT_AVATAR);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [leaders, setLeaders] = useState<Leader[] | null>(null);
  const [rush, setRush] = useState<Rush | null>(null);
  const [rushRanks, setRushRanks] = useState<RushRank[] | null>(null);

  useEffect(() => {
    let stop = false;
    // SECURITY PHASE-1: 2s polling replaces the anon realtime subscription
    // (revoked in migration 0019). Fail-soft: errors keep the last list, and
    // only the very first load falls back to [].
    const loadBosses = (initial: boolean) => {
      fetch("/api/arena/active-bosses")
        .then((r) => r.json())
        .then((d) => {
          if (!stop) setBosses(d.bosses ?? []);
        })
        .catch(() => {
          if (!stop && initial) setBosses([]);
        });
    };
    loadBosses(true);
    const poll = setInterval(() => loadBosses(false), 2000);
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
                setInviteMsg("Bạn vào bằng link mời — cả hai cùng +50 XP!");
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        if (!stop) setLeaders(d.leaders ?? []);
      })
      .catch(() => {
        if (!stop) setLeaders([]);
      });
    fetch("/api/rush/today")
      .then((r) => r.json())
      .then((d) => {
        if (stop || !d.boss) return;
        setRush({ reset_at: d.reset_at as string, boss: d.boss as BossCard });
        fetch("/api/leaderboard?boss=" + (d.boss as BossCard).id)
          .then((r) => r.json())
          .then((rk) => {
            if (!stop) setRushRanks((rk.ranks as RushRank[]) ?? []);
          })
          .catch(() => {
            if (!stop) setRushRanks([]);
          });
      })
      .catch(() => {});
    // Client-only read after hydration; microtask keeps the no-sync-setState lint rule happy.
    queueMicrotask(() => setAvatar(loadAvatar()));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(t);
      clearInterval(poll);
    };
  }, []);

  async function copyInvite() {
    if (!playerId) return;
    const link = window.location.origin + "/arena?invite=" + playerId;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Chép link mời của bạn:", link);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Seed/test leaderboard rows (names like "seed-demo") never reach the UI.
  const hunters = (leaders ?? []).filter((l) => !/^seed/i.test(l.name.trim()));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8">
      <div className="arena-enter flex items-center gap-3">
        <button
          onClick={() => setBuilderOpen(true)}
          title="Tạo anh hùng"
          aria-label="Tạo anh hùng"
          className="block rounded-full ring-2 ring-zinc-700 transition hover:ring-red-400"
        >
          <CharRig spec={avatar} size={48} />
        </button>
        {playerId ? (
          <p className="arena-num inline-block rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-0.5 text-xs font-semibold tabular-nums text-zinc-300">
            Cấp {Math.floor(xp / 100) + 1} — {xp} XP
          </p>
        ) : null}
      </div>
      <PageHeader
        kicker="Chiến trường trực tiếp"
        title={
          <>
            Đấu <span className="arena-title">trường</span>
          </>
        }
        sub="Boss đang live, rush hằng ngày và top thợ săn tối nay."
        right={
          <div className="flex shrink-0 gap-2">
            <button
              onClick={copyInvite}
              disabled={!playerId}
              title="Cả hai cùng +50 XP"
              className="arena-btn-ghost rounded-full px-4 py-2 text-sm font-medium text-zinc-200 disabled:opacity-40"
            >
              {copied ? "Đã chép link!" : "Mời bạn bè"}
            </button>
            <Link href="/scan" className="arena-btn-ghost rounded-full px-4 py-2 text-sm font-medium text-zinc-200">
              + Quét
            </Link>
          </div>
        }
      />
      <nav className="flex gap-2 text-xs font-semibold" aria-label="Các mục đấu trường">
        <a href="#daily-rush" className="rounded-full border border-cyan-800 bg-cyan-950/40 px-3 py-1 text-cyan-200 transition-colors hover:bg-cyan-900/40">
          Rush hằng ngày
        </a>
        <a href="#bosses" className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-800">
          Boss
        </a>
        <a href="#hunters" className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-zinc-300 transition-colors hover:bg-zinc-800">
          Top thợ săn
        </a>
      </nav>
      {inviteMsg ? (
        <p role="status" className="arena-pop rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-2 text-sm font-medium text-emerald-200">
          {inviteMsg}
        </p>
      ) : null}
      {rush ? (
        <Link
          id="daily-rush"
          href={"/boss/" + rush.boss.id}
          className="arena-enter arena-card group flex scroll-mt-4 flex-col gap-3 rounded-2xl border-cyan-700 bg-gradient-to-br from-cyan-950/60 via-transparent to-transparent p-5 shadow-[0_0_32px_rgba(34,211,238,0.2)] transition motion-safe:hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold">
              <span className="mr-2 inline-block rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-bold tracking-widest text-cyan-300">
                Rush hằng ngày — cả nhà cùng đánh một boss
              </span>
              {skillName(rush.boss.skill_tag)}
            </p>
            <span className="shrink-0 font-mono text-sm text-zinc-400 tabular-nums">
              {fmt(new Date(rush.reset_at).getTime() - now)}
            </span>
          </div>
          <HpBar current={rush.boss.current_hp} max={rush.boss.max_hp} />
          <p className="arena-num text-sm text-zinc-400">
            HP {rush.boss.current_hp}/{rush.boss.max_hp} — cả nhà cùng đánh một boss
            <span className="ml-2 text-zinc-600 transition-colors group-hover:text-cyan-300">Vào đánh →</span>
          </p>
          {rushRanks && rushRanks.length > 0 ? (
            <ol className="flex flex-col gap-1 text-sm">
              {rushRanks.slice(0, 5).map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 text-zinc-300">
                  <span className={`w-5 text-center font-black ${i === 0 ? "text-amber-300" : i === 1 ? "text-zinc-200" : i === 2 ? "text-orange-300" : "text-zinc-500"}`}>{i + 1}</span>
                  <span className="flex-1 truncate">
                    {r.name}
                    {r.id === playerId ? <span className="ml-1 text-xs font-bold text-emerald-300">Bạn</span> : null}
                  </span>
                  <span className="arena-num text-zinc-500">{r.solved}/5</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Link>
      ) : null}
      {bosses === null ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label="Đang tải boss đấu trường">
          {[0, 1].map((k) => (
            <div key={k} className="arena-card flex flex-col gap-3 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="arena-shimmer h-10 w-10 rounded-full" />
                  <div className="arena-shimmer h-5 w-40 rounded-lg" />
                </div>
                <div className="arena-shimmer h-5 w-16 rounded-lg" />
              </div>
              <div className="arena-shimmer h-3 rounded-full" />
              <div className="arena-shimmer h-4 w-48 rounded-lg" />
            </div>
          ))}
          <p className="text-sm text-zinc-500">Đang tải đấu trường — lần đầu sẽ gọi Boss Thế giới hôm nay (~30 giây)…</p>
        </div>
      ) : bosses.length === 0 ? (
        <EmptyState
          title="Không có boss nào đang live."
          body="Quét bài để gọi một boss."
          actionLabel="Quét ngay"
          actionHref="/scan"
        />
      ) : (
        <div id="bosses" className="grid scroll-mt-4 gap-3 sm:grid-cols-2">
        {bosses.map((b, i) => {
          const left = new Date(b.despawn_at).getTime() - now;
          const urgent = left < 60000 && b.status === "ALIVE";
          return (
            <Link
              key={b.id}
              href={"/boss/" + b.id}
              className={`arena-enter arena-card group flex flex-col gap-3 rounded-2xl p-5 transition motion-safe:hover:-translate-y-0.5 ${i === 1 ? "arena-d1" : i === 2 ? "arena-d2" : ""} ${b.is_world ? "border-red-800 bg-gradient-to-br from-red-950/50 via-transparent to-transparent shadow-[0_0_32px_rgba(239,68,68,0.25)] hover:shadow-[0_0_44px_rgba(239,68,68,0.4)]" : "hover:border-zinc-600"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  <BossAvatar pct={(b.current_hp / b.max_hp) * 100} rarity={b.rarity} size={40} />
                  {b.is_world ? "Boss Thế giới: " : "Boss: "}
                  {skillName(b.skill_tag)}
                  {b.rarity !== "COMMON" ? (
                    <span className="rounded-full border border-amber-500/60 bg-amber-950/60 px-2 py-0.5 text-xs font-bold text-amber-200">
                      {RARITY_LABEL[b.rarity] ?? b.rarity}
                    </span>
                  ) : null}
                  {b.is_world ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <span className="arena-livedot" />
                      Trực tiếp — HP chung
                    </span>
                  ) : null}
                </p>
                <span className={`shrink-0 font-mono text-sm tabular-nums ${urgent ? "arena-urgent font-bold" : "text-zinc-400"}`}>
                  {fmt(left)}
                </span>
              </div>
              <HpBar current={b.current_hp} max={b.max_hp} />
              <p className="arena-num text-sm text-zinc-400">
                HP {b.current_hp}/{b.max_hp} — {BOSS_STATUS_LABEL[b.status] ?? b.status}
                <span className="ml-2 text-zinc-600 transition-colors group-hover:text-red-400">Đánh →</span>
              </p>
            </Link>
          );
        })}
        </div>
      )}
      <div className="sticky bottom-20 z-10 flex justify-center md:bottom-6">
        <Link href="/scan" className="arena-btn-primary rounded-full px-6 py-2.5 text-sm font-bold text-white">
          + Quét bài mới
        </Link>
      </div>
      <div id="hunters" className="arena-card scroll-mt-4 rounded-2xl p-5">
        <h2 className="font-display text-lg font-extrabold text-zinc-100">Top thợ săn</h2>
        {leaders === null ? (
          <div className="mt-3 flex flex-col gap-2" role="status" aria-busy="true" aria-label="Đang tải bảng xếp hạng">
            {[0, 1, 2].map((k) => (
              <div key={k} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                <div className="arena-shimmer h-7 w-7 shrink-0 rounded-full" />
                <div className="arena-shimmer h-4 flex-1 rounded-lg" />
                <div className="arena-shimmer h-4 w-16 rounded-lg" />
              </div>
            ))}
          </div>
        ) : hunters.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Chưa có thợ săn — hạ boss để lên top bảng.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2">
            {hunters.map((l, i) => (
              <li
                key={l.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${l.id === playerId ? "border-emerald-700 bg-emerald-950/40" : "border-zinc-800 bg-zinc-900/50"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${i === 0 ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50" : i === 1 ? "bg-zinc-300/15 text-zinc-200 ring-1 ring-zinc-400/40" : i === 2 ? "bg-orange-700/25 text-orange-300 ring-1 ring-orange-500/40" : "text-zinc-500"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {l.name}
                  {l.id === playerId ? <span className="ml-2 text-xs font-bold text-emerald-300">Bạn</span> : null}
                </span>
                <span className="arena-num shrink-0 tabular-nums text-zinc-400">{l.bosses_slain} đã hạ</span>
                <span className="arena-num shrink-0 text-xs tabular-nums text-zinc-500">Cấp {l.level} — {l.xp} XP</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {builderOpen ? (
        <AvatarBuilder
          spec={avatar}
          onSave={(s) => {
            saveAvatar(s);
            setAvatar(s);
            setBuilderOpen(false);
          }}
          onClose={() => setBuilderOpen(false)}
        />
      ) : null}
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import RaidBanner from "@/components/raid/RaidBanner";
import { HeroStat } from "@/components/ui/Hero";
import { readApiError, readApiJson } from "@/lib/scan/image-prep";

type Skill = {
  tag: string;
  name: string;
  mastery: number | null;
  status: "solid" | "shaky" | "weak" | "new";
  trend: "up" | "flat" | "down";
  total: number;
  right: number;
  last_at: string | null;
};

type TodayItem = { label: string; href: string; reason: "due" | "weak" | "shaky" | "new" };

const GROUPS = [
  { status: "weak", title: "Cần cố gắng" },
  { status: "shaky", title: "Gần vững" },
  { status: "solid", title: "Vững" },
  { status: "new", title: "Mới" },
] as const;

const REASON_LABEL: Record<TodayItem["reason"], string> = {
  due: "Đến hạn ôn",
  weak: "Cần cố gắng",
  shaky: "Gần vững",
  new: "Mới",
};

const TREND = {
  up: { glyph: "Tăng", label: "đang lên", cls: "text-emerald-300" },
  flat: { glyph: "Ổn định", label: "ổn định", cls: "text-zinc-500" },
  down: { glyph: "Giảm", label: "đang xuống", cls: "text-red-300" },
} as const;

function relativeTime(iso: string | null): string {
  if (!iso) return "Chưa luyện";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "Chưa luyện";
  if (ms < 0) return "Vừa xong";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Vừa xong";
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default function MasteryClient() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [items, setItems] = useState<TodayItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/mastery").then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được bảng thành thạo."));
        return readApiJson<{ skills: Skill[] }>(r, "Không tải được bảng thành thạo.");
      }),
      fetch("/api/mastery/today").then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, "Không tải được bài luyện hôm nay."));
        return readApiJson<{ items: TodayItem[] }>(r, "Không tải được bài luyện hôm nay.");
      }),
    ])
      .then(([m, t]) => {
        if (!alive) return;
        setSkills(m.skills);
        setItems(t.items);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được bảng thành thạo.");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" className="arena-enter rounded-2xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
        {error}
      </p>
    );
  }

  if (skills === null || items === null) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Đang tải bảng thành thạo">
        <div className="arena-shimmer h-24 rounded-2xl" />
        <div className="arena-shimmer h-16 rounded-2xl" />
        <div className="arena-shimmer h-16 rounded-2xl" />
      </div>
    );
  }

  const known = skills.filter((s) => s.mastery !== null);
  const avg = known.length > 0 ? Math.round(known.reduce((a, s) => a + (s.mastery ?? 0), 0) / known.length) : null;
  const weakCount = skills.filter((s) => s.status === "weak").length;

  return (
    <>
      <HeroStat
        value={avg === null ? "Mới" : `${avg}%`}
        label="độ thành thạo trung bình"
        hint={weakCount > 0 ? `${weakCount} kỹ năng cần cố gắng — luyện điểm yếu để kéo cột điểm lên` : "Không còn điểm yếu nào — giữ phong độ nhé"}
      />
      <RaidBanner />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold tracking-widest text-zinc-500">Luyện hôm nay</h2>
        {items.map((it) => (
          <Link
            key={`${it.reason}:${it.href}`}
            href={it.href.startsWith("/drill") ? it.href : "/drill"}
            className="arena-card flex min-h-[48px] items-center justify-between gap-3 rounded-2xl px-4 py-3"
          >
            <span className="min-w-0 text-sm font-semibold text-zinc-100">{it.label}</span>
            <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-sky-200 uppercase">
              {REASON_LABEL[it.reason] ?? it.reason}
            </span>
          </Link>
        ))}
      </section>

      {skills.length === 0 ? (
        <div className="arena-card flex flex-col gap-3 rounded-2xl p-5">
          <p className="text-sm text-zinc-400">
            Chưa có dữ liệu luyện tập — tạo bộ luyện để bắt đầu tích thành thạo.
          </p>
          <Link
            href="/drill"
            className="arena-btn-primary inline-block min-h-[48px] rounded-full px-5 py-3 text-center text-sm font-bold text-white"
          >
            Bắt đầu luyện
          </Link>
        </div>
      ) : null}

      {GROUPS.map((g) => {
        const rows = skills.filter((s) => s.status === g.status);
        if (rows.length === 0) return null;
        return (
          <section key={g.status} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold tracking-widest tabular-nums text-zinc-500">
              {g.title} — {rows.length}
            </h2>
            {rows.map((s) => {
              const t = TREND[s.trend];
              return (
                <div key={s.tag} className="arena-card flex flex-col gap-2 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{s.name}</p>
                    <p className="flex shrink-0 items-center gap-2">
                      <span aria-label={t.label} title={t.label} className={`text-xs font-bold ${t.cls}`}>
                        {t.glyph}
                      </span>
                      <span className="arena-num text-sm font-bold tabular-nums text-zinc-100">
                        {s.mastery === null ? "Mới" : `${s.mastery}%`}
                      </span>
                    </p>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-zinc-800"
                    role="progressbar"
                    aria-label={`${s.name} — độ thành thạo`}
                    aria-valuenow={s.mastery ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400"
                      style={{ width: `${s.mastery ?? 0}%` }}
                    />
                  </div>
                  <div className="flex min-h-[48px] items-center justify-between gap-3">
                    <p className="text-xs tabular-nums text-zinc-500">
                      {s.right}/{s.total} đúng — {relativeTime(s.last_at)}
                    </p>
                    {s.status === "weak" ? (
                      <Link
                        href={`/drill?skill=${encodeURIComponent(s.tag)}`}
                        className="arena-btn-primary inline-block min-h-[48px] rounded-full px-5 py-3 text-center text-xs font-bold text-white"
                      >
                        Luyện ngay
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

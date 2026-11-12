import Link from "next/link";
import type { ReactNode } from "react";
import StreakBadge from "@/components/StreakBadge";
import StartNudge from "@/components/StartNudge";
import ScanHistory from "@/components/ScanHistory";
import TonightStrip from "@/components/TonightStrip";
import EducationHero from "@/components/education/EducationHero";
import ExamStrip from "@/components/education/ExamStrip";
import ClusterSection from "@/components/home/ClusterSection";
import { isDefaultOpen } from "@/components/home/clusters";
import {
  CLUSTERS,
  CLUSTER_ITEMS,
  ClusterGrid,
  SitemapList,
  buildSitemap,
  sitemapCount,
  type ClusterMeta,
} from "@/components/home/clusters";

const STEPS = [
  { n: "01", t: "Quét", d: "Chụp bài thi, ảnh màn hình hay đời thường. AI nhìn trực tiếp — không OCR." },
  { n: "02", t: "Chẩn đoán", d: "Lỗi của bạn được gắn lên cây kỹ năng — từ giải tích đến cơ học — rồi truy về gốc rễ." },
  { n: "03", t: "Diệt boss", d: "Đánh boss 5 câu cùng dạng. Mọi đáp án đều do máy tính kiểm lại." },
];

const META = new Map<string, ClusterMeta>(CLUSTERS.map((c) => [c.id, c]));

function meta(id: string): ClusterMeta {
  const m = META.get(id);
  if (!m) throw new Error("Missing cluster: " + id);
  return m;
}

// Server-side shorthand: resolves cluster catalogue data (title/summary/
// icon/count) and renders the client accordion section around children.
// Server components (EducationHero, ExamStrip) pass through as children.
function Cluster({ id, children }: { id: string; children: ReactNode }) {
  const m = meta(id);
  const count = id === "sitemap" ? sitemapCount() : (CLUSTER_ITEMS[id] ?? []).length;
  return (
    <ClusterSection
      id={m.id}
      title={m.title}
      summary={m.summary}
      count={count}
      defaultOpen={isDefaultOpen(m.id)}
    >
      {children}
    </ClusterSection>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <StreakBadge />
      <StartNudge />
      <header className="mx-auto flex w-full max-w-5xl items-center gap-2 py-4 pl-4 pr-16 text-base sm:pr-32">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]" />
        <span className="shrink-0 text-lg font-black tracking-wide">ARENA</span>
        <nav className="ml-auto hidden gap-3 whitespace-nowrap text-zinc-400 sm:flex sm:gap-5" aria-label="Chính">
          <Link href="/scan" className="font-semibold text-white transition-colors hover:text-cyan-300">Quét bài</Link>
          <Link href="/arena" className="transition-colors hover:text-white">Đấu trường</Link>
          <Link href="/graph" className="transition-colors hover:text-white">Kỹ năng</Link>
          <Link href="/friends" className="transition-colors hover:text-white">Bạn bè</Link>
        </nav>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <p className="arena-enter rounded-full border border-zinc-700 bg-zinc-900/70 px-4 py-1 text-xs font-medium tracking-widest text-zinc-300 uppercase">
          Chụp mọi thứ · Diệt boss bên trong
        </p>
        <h1 className="arena-enter arena-d1 font-display text-5xl font-black tracking-tight text-balance sm:text-6xl">
          Chụp mọi thứ.
          <br />
          <span className="arena-title">Diệt gọn boss.</span>
        </h1>
        <p className="arena-enter arena-d2 max-w-xl text-zinc-400">
          Chụp bài kiểm tra, ảnh màn hình, hay bất cứ thứ gì quanh bạn. Arena tìm ra kỹ năng yếu đằng sau nó — và gốc rễ từ hai chương trước — rồi
          sinh ra một con boss để vá dứt điểm.
        </p>
        <nav className="arena-enter arena-d3 flex w-full flex-col gap-3 text-sm sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center" aria-label="Bắt đầu">
          <Link href="/scan" className="arena-btn-primary rounded-full px-7 py-3 text-center font-semibold text-white">
            Quét bài của bạn
          </Link>
          <Link href="/scan?capture=screen" className="arena-btn-ghost rounded-full px-7 py-3 text-center font-semibold text-zinc-200">
            Chụp màn hình
          </Link>
          <Link href="/scan?mode=life" className="arena-btn-ghost rounded-full px-7 py-3 text-center font-semibold text-zinc-200">
            Chụp đời thường
          </Link>
        </nav>
        <TonightStrip />
        <div className="w-full pt-10 text-left">
          <div className="arena-enter">
            <p className="arena-kicker">Tiêu điểm</p>
            <h2 className="font-display mt-1 text-3xl font-extrabold tracking-tight text-zinc-100">
              Chọn trận của bạn
            </h2>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">Mọi cánh cửa, xếp gọn thành từng cụm.</p>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <Cluster id="hoc-tap">
              <EducationHero />
              <ol aria-label="Cách chơi" className="grid gap-2 sm:grid-cols-3">
                {STEPS.map((s) => (
                  <li
                    key={s.n}
                    className="flex min-h-[48px] items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                  >
                    <span className="arena-kicker shrink-0 tabular-nums">{s.n}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-zinc-100">{s.t}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">{s.d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <ClusterGrid items={CLUSTER_ITEMS["hoc-tap"] ?? []} />
            </Cluster>
            <Cluster id="thi-cu">
              <ExamStrip />
              <ClusterGrid items={CLUSTER_ITEMS["thi-cu"] ?? []} />
            </Cluster>
            <Cluster id="dau-truong">
              <ClusterGrid items={CLUSTER_ITEMS["dau-truong"] ?? []} />
            </Cluster>
            <Cluster id="tien-trinh">
              <ScanHistory />
              <ClusterGrid items={CLUSTER_ITEMS["tien-trinh"] ?? []} />
            </Cluster>
            <Cluster id="tai-khoan">
              <ClusterGrid items={CLUSTER_ITEMS["tai-khoan"] ?? []} />
            </Cluster>
            <Cluster id="sitemap">
              <SitemapList groups={buildSitemap()} />
            </Cluster>
          </div>
        </div>
      </section>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-center text-xs text-zinc-600">
        Đáp án boss do máy kiểm — AI không bao giờ được tin ở đáp án.
      </footer>
    </main>
  );
}

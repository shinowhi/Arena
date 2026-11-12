import Link from "next/link";
import StreakBadge from "@/components/StreakBadge";
import StartNudge from "@/components/StartNudge";
import ScanHistory from "@/components/ScanHistory";
import TonightStrip from "@/components/TonightStrip";
import EducationHero from "@/components/education/EducationHero";
import ExamStrip from "@/components/education/ExamStrip";
import PageHeader from "@/components/ui/PageHeader";
import {
  BookIcon,
  CameraIcon,
  CardsIcon,
  FlameIcon,
  GhostIcon,
  GlobeIcon,
  MapIcon,
  ReportIcon,
  SwordsIcon,
  TimerIcon,
} from "@/components/icons";

const STEPS = [
  { n: "01", t: "Quét", d: "Chụp bài thi, ảnh màn hình hay đời thường. AI nhìn trực tiếp — không OCR." },
  { n: "02", t: "Chẩn đoán", d: "Lỗi của bạn được gắn lên cây kỹ năng — từ giải tích đến cơ học — rồi truy về gốc rễ." },
  { n: "03", t: "Diệt boss", d: "Đánh boss 5 câu cùng dạng. Mọi đáp án đều do máy tính kiểm lại." },
];

const SPOTLIGHT = [
  { Icon: CameraIcon, t: "Quét bài", d: "Bài thi, ảnh màn hình hay đời thường. AI nhìn trực tiếp — không OCR.", href: "/scan", cta: "Quét ngay", dl: "arena-d1", accent: "hover:border-cyan-400/70 hover:shadow-[0_0_36px_rgba(34,211,238,0.3)]", glow: "text-cyan-300" },
  { Icon: SwordsIcon, t: "Đánh boss", d: "Kỹ năng yếu nhất của bạn, đang sống. 5 câu hỏi ngăn bạn hạ nó.", href: "/arena", cta: "Vào đấu trường", dl: "arena-d2", accent: "hover:border-red-500/70 hover:shadow-[0_0_36px_rgba(239,68,68,0.35)]", glow: "text-red-400" },
  { Icon: GlobeIcon, t: "Đời thường", d: "Chụp bất cứ gì quanh bạn — nhận về một bài toán giải được từ cảnh đó.", href: "/scan?mode=life", cta: "Thử ngay", dl: "arena-d3", accent: "hover:border-emerald-400/70 hover:shadow-[0_0_36px_rgba(52,211,153,0.3)]", glow: "text-emerald-300" },
  { Icon: GhostIcon, t: "Lớp học ma", d: "Những thợ săn ẩn danh đang cày cùng bạn tối nay. Không bao giờ học một mình.", href: "/ghosts", cta: "Tham gia", dl: "arena-d4", accent: "hover:border-violet-400/70 hover:shadow-[0_0_36px_rgba(167,139,250,0.3)]", glow: "text-violet-300" },
];

const MORE = [
  { Icon: FlameIcon, t: "Chuỗi ngày vá", href: "/streak" },
  { Icon: BookIcon, t: "Nhật ký vá gốc", href: "/diary" },
  { Icon: TimerIcon, t: "Đếm ngược kỳ thi", href: "/countdown" },
  { Icon: CardsIcon, t: "Thẻ công thức", href: "/cards" },
  { Icon: MapIcon, t: "Lộ trình 30 ngày", href: "/roadmap" },
  { Icon: ReportIcon, t: "Báo cáo phụ huynh", href: "/parent" },
];

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
        <EducationHero />
        <ExamStrip />
        <div className="grid w-full gap-3 pt-6 text-left sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className={`arena-enter arena-card rounded-2xl p-5 ${i === 1 ? "arena-d2" : i === 2 ? "arena-d3" : "arena-d1"}`}>
              <p className="arena-kicker">{s.n}</p>
              <p className="font-display mt-1 text-lg font-bold">{s.t}</p>
              <p className="mt-1 text-sm text-zinc-400">{s.d}</p>
            </div>
          ))}
        </div>
        <ScanHistory />
        <div className="w-full pt-10 text-left">
          <PageHeader kicker="Tiêu điểm" title="Chọn trận của bạn" sub="Bốn cánh cửa, không cửa nào sai." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SPOTLIGHT.map((f) => (
              <Link
                key={f.t}
                href={f.href}
                className={
                  "arena-enter arena-card group block rounded-2xl p-5 transition-all hover:-translate-y-1 " +
                  f.dl +
                  " " +
                  f.accent
                }
              >
                <span className={"block " + f.glow} aria-hidden="true">
                  <f.Icon className="h-10 w-10" />
                </span>
                <span className="mt-3 block">
                  <span className="font-display block text-xl font-black">{f.t}</span>
                  <span className="mt-1 block text-sm text-zinc-400">{f.d}</span>
                  <span className={"mt-2 block text-sm font-bold " + f.glow}>{f.cta} →</span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-8 text-xs font-bold tracking-widest text-zinc-500">KHO VŨ KHÍ</p>
          <nav className="relative mt-3" aria-label="Kho vũ khí">
            <ul
              role="list"
              tabIndex={0}
              aria-label="Kho vũ khí, cuộn ngang"
              className="arena-scrollx flex snap-x gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
            >
              {MORE.map((m) => (
                <li key={m.href} className="shrink-0 snap-start">
                  <Link
                    href={m.href}
                    className="arena-btn-ghost flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap text-zinc-300 transition-transform hover:-translate-y-0.5"
                  >
                    <m.Icon className="h-5 w-5 text-zinc-400" />
                    {m.t}
                  </Link>
                </li>
              ))}
            </ul>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#08080f] to-transparent sm:hidden"
            />
          </nav>
        </div>
      </section>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-6 text-center text-xs text-zinc-600">
        Đáp án boss do máy kiểm — AI không bao giờ được tin ở đáp án.
      </footer>
    </main>
  );
}
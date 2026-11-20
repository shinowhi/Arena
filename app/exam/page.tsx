import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

// Exam center: one hub for every exam mode. Server component, no data fetch.
const MODES = [
  { href: "/thpt", title: "Thi thử THPTQG", desc: "50 câu — 90 phút — điền đáp số" },
  { href: "/vact", title: "Thi thử V-ACT", desc: "120 câu — 150 phút — 4 lựa chọn" },
  { href: "/hsa", title: "Thi thử HSA", desc: "150 câu — bấm giờ từng phần — chọn phần 3" },
  { href: "/duel", title: "Thách đấu thi", desc: "Đấu tay đôi từng phần — xếp hạng ELO" },
  { href: "/royale", title: "Đấu trường sinh tồn", desc: "Tối đa 8 người — vòng 30 giây — người cuối cùng thắng" },
  { href: "/adaptive", title: "Luyện thích ứng", desc: "Kỹ năng yếu nhất trước — cấp độ theo trình độ của bạn" },
  { href: "/essay", title: "Chấm bài tự luận", desc: "Chụp bài làm — thang điểm + máy kiểm tra" },
  { href: "/tutor", title: "Gia sư AI", desc: "Trò chuyện học tập miễn phí — không bao giờ lộ đáp án" },
  { href: "/transparency", title: "Minh bạch", desc: "Số liệu kho câu hỏi trực tiếp — cách chúng tôi kiểm chứng" },
];

export default function ExamHubPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Trung tâm thi"
        title={<>Chọn <span className="arena-title">trận đấu</span> của bạn</>}
        sub="Thi thử toàn quốc, thách đấu xếp hạng, bộ luyện thích ứng và gia sư — tất cả đều được kiểm chứng bằng máy khi có thể."
      />
      <div className="flex flex-col gap-3">
        {MODES.map((m) => (
          <Link key={m.href} href={m.href} className="arena-card rounded-2xl p-5 transition-colors hover:border-zinc-600 hover:bg-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2">
            <h2 className="font-display text-lg font-extrabold text-zinc-100">{m.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{m.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

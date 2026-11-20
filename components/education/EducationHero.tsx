import Link from "next/link";

// Education-first entry (B-owned): one headline, one primary CTA.
export default function EducationHero() {
  return (
    <section
      aria-label="Bắt đầu học"
      className="arena-enter arena-card w-full rounded-2xl p-6 text-center sm:p-8"
    >
      <p className="arena-kicker">Bắt đầu trong 60 giây</p>
      <h2 className="font-display mt-2 text-2xl font-black tracking-tight text-balance sm:text-3xl">
        Quét bài tập, tìm kỹ năng yếu, luyện đến chắc
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        Chụp một tấm ảnh bài tập. Đấu trường chỉ ra đúng kỹ năng đang kìm bạn lại —
        rồi biến nó thành một con boss để bạn hạ gục.
      </p>
      <div className="mt-4 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/scan?sample=1"
          className="arena-btn-primary inline-flex min-h-[48px] items-center justify-center rounded-full px-7 py-3 text-center font-semibold text-white"
        >
          Thử quét mẫu
        </Link>
        <Link
          href="/scan"
          className="arena-btn-ghost inline-flex min-h-[48px] items-center justify-center rounded-full px-7 py-3 text-center font-semibold text-zinc-200"
        >
          Quét bài của tôi
        </Link>
      </div>
    </section>
  );
}

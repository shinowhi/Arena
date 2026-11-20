import Link from "next/link";

// The night market is taking a break: posting and claiming are paused while
// we focus on the learning core. The page stays up (routes and nav untouched)
// with pointers to where the action is.
export default function MarketPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-medium text-zinc-400">Chợ treo thưởng</p>
      <h1 className="font-display mt-1 text-2xl font-extrabold text-zinc-100">
        Treo thưởng đang tạm nghỉ
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Đăng và nhận thưởng đang tạm dừng để tập trung vào phần học chính. XP và các thưởng cũ của
        bạn vẫn an toàn. Còn cách kiếm XP tốt nhất vẫn như xưa: quét bài, diệt boss rồi leo các kỳ
        thi.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/scan"
          className="arena-btn-primary inline-flex min-h-[48px] items-center rounded-full px-6 py-2 text-sm font-bold text-white"
        >
          Quét bài
        </Link>
        <Link
          href="/exam"
          className="arena-btn-ghost inline-flex min-h-[48px] items-center rounded-full px-6 py-2 text-sm font-bold text-zinc-200"
        >
          Thi thử
        </Link>
      </div>
    </main>
  );
}

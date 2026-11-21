import Link from "next/link";

// Study rooms are taking a break: rooms and chat are paused while we focus
// on the learning core. The page stays up (routes and nav untouched) with
// pointers to where the action is.
export default function GroupsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold text-amber-400">Phòng học nhóm</p>
      <h1 className="mt-1 text-2xl font-extrabold text-balance text-zinc-100">Đang tạm nghỉ để sửa phòng</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Phòng học nhóm đang tạm đóng để sửa lại cho vui hơn — danh sách bạn bè của bạn
        vẫn còn nguyên. Trong lúc chờ, rủ bạn lập đội thi đua, hoặc quét một bài
        để giữ chuỗi ngày học.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/friends"
          className="arena-btn-primary inline-flex min-h-[48px] items-center rounded-lg px-4 py-2 text-sm font-bold text-white"
        >
          Rủ bạn lập đội
        </Link>
        <Link
          href="/scan"
          className="inline-flex min-h-[48px] items-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          Quét một bài
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";

// Vietnamese 404: the page doesn't exist (or a boss ate it). Two exits, no dead end.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 px-4 py-16 text-center">
      <p className="arena-kicker">404 — không thấy trang</p>
      <h1 className="font-display text-3xl font-extrabold text-balance text-zinc-100">
        Lạc đường rồi!
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-zinc-400">
        Trang này không tồn tại — có thể boss đã ăn mất. Về đấu trường
        đánh tiếp nhé.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link
          href="/arena"
          className="arena-btn-primary inline-flex min-h-[48px] items-center rounded-full px-6 py-2.5 text-sm font-bold text-white"
        >
          Về đấu trường
        </Link>
        <Link
          href="/scan"
          className="arena-btn-ghost inline-flex min-h-[48px] items-center rounded-full px-6 py-2.5 text-sm font-bold text-zinc-200"
        >
          Quét bài mới
        </Link>
      </div>
    </main>
  );
}

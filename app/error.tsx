"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route error boundary: branded Vietnamese fallback with a retry action.
// Rendered inside the root layout (header/tab bar stay), so arena styles apply.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-4 px-4 py-16 text-center">
      <p className="arena-kicker">Trang bị choáng</p>
      <h1 className="font-display text-3xl font-extrabold text-balance text-zinc-100">
        Có gì đó sai sai
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-zinc-400">
        Trang này tải không được — thường do mạng chập chờn. Thử lại nhé,
        tiến độ của bạn vẫn còn nguyên.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="arena-btn-primary inline-flex min-h-[48px] items-center rounded-full px-6 py-2.5 text-sm font-bold text-white"
        >
          Thử lại
        </button>
        <Link
          href="/arena"
          className="arena-btn-ghost inline-flex min-h-[48px] items-center rounded-full px-6 py-2.5 text-sm font-bold text-zinc-200"
        >
          Về đấu trường
        </Link>
      </div>
    </main>
  );
}

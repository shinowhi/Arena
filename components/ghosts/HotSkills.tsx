import Link from "next/link";

export type HotSkill = { tag: string; name: string; count: number };

// Per-skill JOIN rows: primary link forges a drill on that exact skill
// (?skill= preselects the drill-hub topic), secondary goes to the arena.
export default function HotSkills({ skills }: { skills: HotSkill[] }) {
  return (
    <section aria-label="Kỹ năng đang nóng" className="arena-card rounded-2xl p-4">
      <p className="text-sm font-semibold text-zinc-300">Đang nóng</p>
      {skills.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">Chưa có kỹ năng nào nóng — bạn đốt lửa nhé.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {skills.map((s) => (
            <li
              key={s.tag}
              className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
            >
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate text-sm font-bold text-zinc-100" title={s.name}>
                  {s.name}
                </span>
                <span className="block text-xs text-zinc-500 tabular-nums">
                  {s.count} lượt giải · 15 phút
                </span>
              </span>
              <span className="flex shrink-0 gap-2 text-xs">
                <Link
                  href={"/drill?skill=" + encodeURIComponent(s.tag)}
                  className="arena-btn-primary inline-flex min-h-[48px] items-center rounded-full px-4 py-2 font-bold whitespace-nowrap text-white"
                >
                  Luyện ngay
                </Link>
                <Link
                  href="/arena"
                  className="arena-btn-ghost inline-flex min-h-[48px] items-center rounded-full px-4 py-2 font-semibold whitespace-nowrap text-zinc-200"
                >
                  Đấu trường
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

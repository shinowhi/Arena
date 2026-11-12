export type FeedItem = { skillTag: string; skillName: string; minutesAgo: number };

function agoVi(m: number): string {
  if (m <= 0) return "vừa xong";
  if (m === 1) return "1 phút trước";
  return m + " phút trước";
}

// Pseudonymous live feed: skill name + relative minutes only — no player
// ids, no names. Data comes from the page-level /api/ghosts poll.
export default function GhostFeed({ items }: { items: FeedItem[] }) {
  return (
    <section aria-label="Mới giải xong" className="arena-card rounded-2xl p-4">
      <p className="text-sm font-semibold text-zinc-300">Mới giải xong</p>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">Chưa có ai giải tối nay — bạn mở màn nhé</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((f, i) => (
            <li
              key={f.skillTag + "-" + i}
              className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span className="truncate text-sm text-zinc-200" title={f.skillName}>
                  {f.skillName}
                </span>
              </span>
              <span className="shrink-0 text-xs whitespace-nowrap text-zinc-500 tabular-nums">
                {agoVi(f.minutesAgo)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

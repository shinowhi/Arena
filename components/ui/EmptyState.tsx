// Shared empty state: title + direction + one action. Never a dead end.
import Link from "next/link";

export default function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="arena-card rounded-2xl p-8 text-center">
      <p className="font-display text-xl font-bold text-zinc-100">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">{body}</p>
      <Link
        href={actionHref}
        className="arena-btn-primary mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

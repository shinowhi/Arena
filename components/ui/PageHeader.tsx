// Shared page header: kicker + display title + one-line sub. One rhythm everywhere.
export default function PageHeader({
  kicker,
  title,
  sub,
  right,
}: {
  kicker: string;
  title: React.ReactNode;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="arena-enter flex items-end justify-between gap-3">
      <div>
        <p className="arena-kicker">{kicker}</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight text-zinc-100">
          {title}
        </h1>
        {sub ? <p className="mt-1 max-w-xl text-sm text-zinc-400">{sub}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

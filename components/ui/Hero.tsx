// Characteristic-first hero strips (H1–H6). Each page renders ONE of these
// above or below its PageHeader — the h1 stays inside PageHeader, so heading
// order and aria are untouched. No deps, Vietnamese copy comes from callers.
import type { ReactNode } from "react";

// H1 stat-lead: the key number first, giant and tabular.
export function HeroStat({ value, label, hint }: { value: ReactNode; label: string; hint?: string }) {
  return (
    <div className="arena-enter flex items-end justify-between gap-4 border-b border-zinc-800 pb-4">
      <div>
        <p className="arena-num font-display text-5xl font-extrabold tracking-tight text-zinc-50">{value}</p>
        <p className="mt-1 text-sm font-semibold text-cyan-300">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
      </div>
      <span aria-hidden="true" className="mb-1 h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-red-500 to-amber-500" />
    </div>
  );
}

// H2 action-lead: the primary CTA first, full-width band.
export function HeroAction({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="arena-card arena-enter flex flex-col gap-3 rounded-2xl border-l-2 border-l-red-500 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-display text-lg font-extrabold text-zinc-50">{title}</p>
        {sub ? <p className="mt-0.5 text-sm text-zinc-400">{sub}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// H3 entity-lead: the key object (nemesis, link code, live boss) as the star.
export function HeroEntity({
  eyebrow,
  name,
  meta,
  children,
}: {
  eyebrow: string;
  name: ReactNode;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <div className="arena-card arena-enter relative overflow-hidden rounded-2xl p-5 text-center">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
      <p className="text-xs font-bold tracking-wide text-zinc-400">{eyebrow}</p>
      <p className="font-display mt-1 text-2xl font-extrabold tracking-tight text-zinc-50 text-wrap-balance">{name}</p>
      {meta ? <p className="arena-num mt-1 text-sm text-cyan-300">{meta}</p> : null}
      {children ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

// H4 status-lead: timer/state banner with a live dot.
export function HeroStatus({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" className="arena-enter flex items-center gap-3 rounded-2xl border border-cyan-900 bg-cyan-950/40 px-4 py-3">
      <span aria-hidden="true" className="arena-livedot shrink-0" />
      <p className="text-xs font-bold tracking-wide text-cyan-200">{label}</p>
      <div className="arena-num ml-auto flex items-center gap-2 text-sm font-bold text-zinc-100">{children}</div>
    </div>
  );
}

// H5 content-lead: shrunk header row so the list/content leads.
export function HeroList({ count, label, action }: { count: ReactNode; label: string; action?: ReactNode }) {
  return (
    <div className="arena-enter flex items-center gap-3">
      <p className="arena-num font-display text-3xl font-extrabold text-zinc-50">{count}</p>
      <p className="text-sm text-zinc-400">{label}</p>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}

// H6 minimal: one line + action for tiny pages.
export function HeroMini({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="arena-enter flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
      <p className="font-display text-lg font-extrabold text-zinc-50">{title}</p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

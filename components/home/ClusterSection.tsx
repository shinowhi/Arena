"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { CLUSTERS, DEFAULT_OPEN_IDS } from "./clusters";

const KEY = "arena-clusters";

type Icon = ComponentType<{ className?: string }>;

function readStored(): string[] | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter((v): v is string => typeof v === "string");
  } catch {
    return null;
  }
}

function writeStored(ids: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private mode / quota — clusters still work, prefs just don't persist.
  }
}

function NullIcon({ className }: { className?: string }) {
  return <span aria-hidden="true" className={className} />;
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// Homepage cluster: an accessible accordion section. The header is an h2
// (the page h1 lives in the hero) wrapping a native button; the panel is a
// labelled region. Open animation uses the grid-rows trick plus an inner
// transform/opacity fade — no height measuring, no layout jank — and honors
// prefers-reduced-motion. Open ids persist to localStorage (fail-soft).
export default function ClusterSection({
  id,
  title,
  summary,
  count,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  // Icon resolves client-side by id: component references cannot cross the
  // server/client boundary as props (Next build rule).
  const Icon: Icon = CLUSTERS.find((c) => c.id === id)?.icon ?? NullIcon;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    // Mount-time sync from localStorage (external system); queued so the
    // first render matches SSR and hydration never mismatches.
    queueMicrotask(() => {
      const stored = readStored();
      if (stored !== null) setOpen(stored.includes(id));
    });
  }, [id]);

  const btnId = `cluster-btn-${id}`;
  const panelId = `cluster-panel-${id}`;

  function toggle() {
    const next = !open;
    setOpen(next);
    const base = readStored() ?? [...DEFAULT_OPEN_IDS];
    const ids = new Set(base);
    if (next) ids.add(id);
    else ids.delete(id);
    writeStored([...ids]);
  }

  return (
    <section aria-labelledby={btnId} className="arena-card overflow-hidden rounded-2xl">
      <h2>
        <button
          type="button"
          id={btnId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex min-h-[48px] w-full items-center gap-3 p-4 text-left"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/70 text-red-300"
          >
            <Icon className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-display text-lg font-extrabold tracking-tight text-zinc-100">
                {title}
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 text-xs font-semibold text-zinc-400 tabular-nums">
                {count} mục
              </span>
            </span>
            <span className="mt-0.5 block truncate text-sm text-zinc-400" title={summary}>
              {summary}
            </span>
          </span>
          <Chevron
            className={
              "h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-300 motion-reduce:transition-none " +
              (open ? "rotate-180" : "")
            }
          />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        inert={!open}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={
              "space-y-3 px-4 pt-1 pb-4 transition-all duration-300 motion-reduce:transition-none " +
              (open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0")
            }
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

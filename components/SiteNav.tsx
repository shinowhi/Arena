"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Shared navigation (F1): desktop header nav + mobile bottom tab bar.
// Rendered once in app/layout.tsx so every page has navigation —
// new players reach Friends without a home round-trip.
const TABS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/scan", label: "Scan", icon: "📸" },
  { href: "/arena", label: "Arena", icon: "⚔️" },
  { href: "/friends", label: "Friends", icon: "🧑‍🤝‍🧑" },
  { href: "/chat", label: "Chat", icon: "💬" },
];

const NAV = [
  { href: "/scan", label: "Scan" },
  { href: "/arena", label: "Arena" },
  { href: "/graph", label: "Skills" },
  { href: "/friends", label: "Friends" },
  { href: "/chat", label: "Chat" },
];

function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  if (path.startsWith(href)) return true;
  // Boss fights belong to the arena tab.
  if (href === "/arena" && path.startsWith("/boss")) return true;
  return false;
}

export function SiteHeader() {
  const path = usePathname();
  if (path === "/") return null; // Home renders its own hero header.
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center gap-2 px-4 py-4 text-sm">
      <Link href="/" className="flex items-center gap-2" aria-label="Arena home">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]"
        />
        <span className="font-bold tracking-wide">ARENA</span>
      </Link>
      <nav className="ml-auto hidden gap-4 text-zinc-400 md:flex" aria-label="Primary">
        {NAV.map((n) => {
          const active = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`transition-colors hover:text-white ${active ? "font-semibold text-white" : ""}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/scan"
        className="arena-btn-primary ml-auto rounded-full px-4 py-1.5 font-semibold text-white md:hidden"
      >
        + Scan
      </Link>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <>
      <div aria-hidden="true" className="h-16 md:hidden" />
      <nav
        aria-label="Primary"
        className="arena-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(path, t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-label={t.label}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 transition-colors ${
                    active ? "text-white" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    {t.icon}
                  </span>
                  <span className="text-[11px] font-semibold">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

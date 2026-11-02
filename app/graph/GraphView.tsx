"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import graph from "@/lib/graph/skill-graph.json";
import { SKILL_IDS, skillName } from "@/lib/graph/skills";
import PageHeader from "@/components/ui/PageHeader";

type Node = { id: string; name: string; description: string; prereqs: string[]; subject?: string };

// Group nodes by depth (longest prereq chain) so the graph reads left to right.
function levels(nodes: Node[]): Node[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const visit = (id: string, chain: Set<string>): number => {
    const hit = depth.get(id);
    if (hit !== undefined) return hit;
    const prereqs = (byId.get(id)?.prereqs ?? []).filter((p) => !chain.has(p));
    chain.add(id);
    const d = prereqs.length === 0 ? 0 : Math.max(...prereqs.map((p) => visit(p, chain))) + 1;
    chain.delete(id);
    depth.set(id, d);
    return d;
  };
  nodes.forEach((n) => visit(n.id, new Set()));
  const max = Math.max(...depth.values());
  return Array.from({ length: max + 1 }, (_, d) => nodes.filter((n) => depth.get(n.id) === d));
}

export default function GraphView() {
  const params = useSearchParams();
  const weak = params.get("weak") ?? "";
  const root = params.get("root") ?? "";
  const [subject, setSubject] = useState<"all" | "calculus" | "mechanics">("all");
  const nodes = (graph as { skills: Node[] }).skills;
  const cols = levels(nodes);
  const ring = (id: string) =>
    id === weak
      ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.45)]"
      : id === root
        ? "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)]"
        : "border-zinc-800";
  const dot = (s?: string) =>
    (s ?? "calculus") === "mechanics"
      ? "bg-sky-400 shadow-[0_0_8px_#38bdf8]"
      : "bg-emerald-400 shadow-[0_0_8px_#34d399]";
  const dim = (s?: string) =>
    subject === "all" ? "" : (s ?? "calculus") === subject ? "" : "opacity-40";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8">
      <div className="arena-enter">
        <PageHeader
          kicker={`${SKILL_IDS.length} skills · foundations left`}
          title={
            <>
              Skill <span className="arena-title">graph</span>
            </>
          }
          sub="Weak skills glow red, root causes glow gold. Scroll sideways to walk the chain."
        />
        <div className="mt-2 flex gap-4 text-xs text-zinc-400">
          {weak ? (
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
              Weak: {skillName(weak)}
            </span>
          ) : null}
          {root ? (
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              Root: {skillName(root)}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {(["all", "calculus", "mechanics"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              className={`rounded-full px-3 py-1 font-semibold capitalize transition-colors ${subject === s ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              {s}
            </button>
          ))}
          <span className="ml-2 text-zinc-500">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
            calc
            <span className="mr-1 ml-3 inline-block h-2 w-2 rounded-full bg-sky-400" />
            mech
          </span>
        </div>
      </div>
      <p className="text-xs text-zinc-500 md:hidden" aria-hidden="true">
        ← Swipe sideways to explore every level →
      </p>
      <div
        role="region"
        aria-label="Skill levels, scroll sideways"
        tabIndex={0}
        className="arena-enter arena-d1 arena-scrollx flex gap-3 overflow-x-auto pb-4"
      >
        {cols.map((col, d) => (
          <div key={d} className="flex w-56 shrink-0 flex-col gap-2">
            <p className="arena-num text-xs font-bold tracking-widest text-zinc-500 uppercase">Level {d}</p>
            {col.map((n) => (
              <div key={n.id} className={`arena-card rounded-xl border p-2.5 transition-transform hover:-translate-y-0.5 ${ring(n.id)} ${dim(n.subject)}`}>
                <p className="text-sm font-semibold text-zinc-100">
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${dot(n.subject)}`} />
                  {n.name}
                </p>
                <p className="text-xs text-zinc-500">
                  <code>{n.id}</code>
                </p>
                {n.prereqs.length > 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">needs: {n.prereqs.join(", ")}</p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-600">foundation</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <nav className="flex gap-4 text-sm text-zinc-400">
        <Link href="/scan" className="transition-colors hover:text-white">
          ← Back to scan
        </Link>
        <Link href="/arena" className="transition-colors hover:text-white">
          Enter arena
        </Link>
      </nav>
    </main>
  );
}
"use client";
import { useSearchParams } from "next/navigation";
import graph from "@/lib/graph/skill-graph.json";
import { skillName } from "@/lib/graph/skills";

type Node = { id: string; name: string; description: string; prereqs: string[] };

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
  const nodes = (graph as { skills: Node[] }).skills;
  const cols = levels(nodes);
  const ring = (id: string) =>
    id === weak
      ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.45)]"
      : id === root
        ? "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)]"
        : "border-zinc-800";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-8">
      <div className="arena-enter">
        <p className="text-xs font-bold tracking-widest text-red-400 uppercase">36 skills · foundations left</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">
          Skill <span className="arena-title">graph</span>
        </h1>
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
      </div>
      <div className="arena-enter arena-d1 flex gap-3 overflow-x-auto pb-4">
        {cols.map((col, d) => (
          <div key={d} className="flex w-56 shrink-0 flex-col gap-2">
            <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Level {d}</p>
            {col.map((n) => (
              <div key={n.id} className={`arena-card rounded-xl border p-2.5 ${ring(n.id)}`}>
                <p className="text-sm font-semibold text-zinc-100">{n.name}</p>
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
        <a href="/scan" className="transition-colors hover:text-white">
          ← Back to scan
        </a>
        <a href="/arena" className="transition-colors hover:text-white">
          Enter arena
        </a>
      </nav>
    </main>
  );
}
"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import graph from "@/lib/graph/skill-graph.json";
import { SKILL_IDS, skillName } from "@/lib/graph/skills";
import PageHeader from "@/components/ui/PageHeader";

type Node = { id: string; name: string; description: string; prereqs: string[]; subject?: string };

// Display-only Vietnamese labels (filter values and node subjects stay as API codes).
const SUBJECT_LABEL: Record<"all" | "calculus" | "mechanics", string> = {
  all: "Tất cả",
  calculus: "Giải tích",
  mechanics: "Cơ học",
};

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
        <div className="mt-2 flex gap-4 text-xs text-zinc-400">
          {weak ? (
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
              Yếu: {skillName(weak)}
            </span>
          ) : null}
          {root ? (
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              Gốc: {skillName(root)}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {(["all", "calculus", "mechanics"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              aria-label={`Lọc môn: ${SUBJECT_LABEL[s]}`}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${subject === s ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              {SUBJECT_LABEL[s]}
            </button>
          ))}
          <span className="ml-2 text-zinc-500">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
            Giải tích
            <span className="mr-1 ml-3 inline-block h-2 w-2 rounded-full bg-sky-400" />
            Cơ học
          </span>
        </div>
      </div>
      <p className="text-xs text-zinc-500 md:hidden" aria-hidden="true">
        ← Vuốt ngang để xem mọi cấp →
      </p>
      <div
        role="region"
        aria-label="Các cấp kỹ năng, cuộn ngang để xem"
        tabIndex={0}
        className="arena-enter arena-d1 arena-scrollx flex gap-3 overflow-x-auto pb-4"
      >
        {cols.map((col, d) => (
          <div key={d} className="flex w-56 shrink-0 flex-col gap-2">
            <h2 className="arena-num text-xs font-bold tracking-widest text-zinc-500">Cấp {d}</h2>
            {col.map((n) => (
              <div key={n.id} className={`arena-card rounded-xl border p-2.5 transition-transform motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none ${ring(n.id)} ${dim(n.subject)}`}>
                <p className="text-sm font-semibold text-zinc-100">
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${dot(n.subject)}`} />
                  {n.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {(n.subject ?? "calculus") === "mechanics" ? "Cơ học" : "Giải tích"}
                </p>
                {n.prereqs.length > 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">Cần: {n.prereqs.map((p) => skillName(p)).join(", ")}</p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-600">Nền tảng</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <PageHeader
        kicker={`${SKILL_IDS.length} kỹ năng — nền tảng ở bên trái`}
        title={
          <>
            Sơ đồ <span className="arena-title">kỹ năng</span>
          </>
        }
        sub="Kỹ năng yếu sáng đỏ, gốc rễ sáng vàng."
      />
      <nav className="flex gap-4 text-sm text-zinc-400">
        <Link href="/scan" className="transition-colors hover:text-white">
          ← Về quét bài
        </Link>
        <Link href="/arena" className="transition-colors hover:text-white">
          Vào đấu trường
        </Link>
      </nav>
    </main>
  );
}
import { Suspense } from "react";
import GraphView from "./GraphView";

export default function GraphPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-4 py-8"><p className="text-zinc-500">Loading skill graph…</p></main>}>
      <GraphView />
    </Suspense>
  );
}
import { Suspense } from "react";
import GraphView from "./GraphView";

export default function GraphPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-8"><p className="text-zinc-500">Đang tải sơ đồ kỹ năng…</p></main>}>
      <GraphView />
    </Suspense>
  );
}
import PageHeader from "@/components/ui/PageHeader";
import HubClient from "./hub-client";

// Drill hub (server shell: static-safe, no cookies at the top level — all
// per-visitor state loads client-side inside HubClient).
export default function DrillPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <HubClient />
      <PageHeader
        kicker="Tự luyện"
        title={
          <>
            Trung tâm <span className="arena-title">luyện tập</span>
          </>
        }
        sub="Bộ luyện từ kỹ năng yếu, câu đã sai, chủ đề hoặc ảnh."
      />
    </main>
  );
}

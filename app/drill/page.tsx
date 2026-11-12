import PageHeader from "@/components/ui/PageHeader";
import HubClient from "./hub-client";

// Drill hub (server shell: static-safe, no cookies at the top level — all
// per-visitor state loads client-side inside HubClient).
export default function DrillPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Self practice"
        title={
          <>
            Drill <span className="arena-title">hub</span>
          </>
        }
        sub="Forge a practice set from your weak skills, your misses, any topic, or a photo. Answers stay on the server — only your score comes back."
      />
      <HubClient />
    </main>
  );
}

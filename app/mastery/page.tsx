import PageHeader from "@/components/ui/PageHeader";
import MasteryClient from "./mastery-client";

// Mastery dashboard (server shell: static-safe, no cookies at the top level —
// all per-visitor state loads client-side inside MasteryClient).
export default function MasteryPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Your progress"
        title={
          <>
            Mastery <span className="arena-title">dashboard</span>
          </>
        }
        sub="Every skill you practiced, ranked by mastery. Drill your weak spots and watch the bars climb."
      />
      <MasteryClient />
    </main>
  );
}

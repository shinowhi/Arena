import PageHeader from "@/components/ui/PageHeader";
import CenterClient from "./center-client";

// Center hub (server shell: static-safe, no cookies at the top level — all
// per-visitor roles load client-side inside CenterClient via /api/center/me).
export default function CenterPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-8">
      <PageHeader
        kicker="Learning centers"
        title={
          <>
            Center <span className="arena-title">classes</span>
          </>
        }
        sub="Teachers run classes with join codes and assignments. Enrolled students get full VIP while their class is active."
      />
      <CenterClient />
    </main>
  );
}
